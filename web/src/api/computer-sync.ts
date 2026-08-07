/** Single lifecycle entry point for computer sync and LAN discovery. */
import { pairServer, setServerUrl } from './client';
import {
  restartDiscovery,
  startDiscovery,
  stopDiscovery,
} from './discover';
import { initializeLocalState, startSync, stopSync } from './sync';
import { isSyncEnabled, persistSyncEnabled } from './sync-preference';
import { savePairingToken } from './pairing-storage';

let controlGeneration = 0;
let controlChain: Promise<void> = Promise.resolve();
let pairingAbortController: AbortController | null = null;

function serialize(operation: () => Promise<void>): Promise<void> {
  const result = controlChain.then(operation, operation);
  controlChain = result.catch(() => {});
  return result;
}

async function startBoth(generation: number) {
  if (generation !== controlGeneration || !isSyncEnabled()) return;
  await Promise.all([startSync(), startDiscovery()]);
}

export function initializeComputerSync(): Promise<void> {
  initializeLocalState();
  const generation = ++controlGeneration;
  if (!isSyncEnabled()) {
    stopSync();
    return stopDiscovery();
  }
  return serialize(() => startBoth(generation));
}

export function setComputerSyncEnabled(enabled: boolean): Promise<void> {
  persistSyncEnabled(enabled);
  const generation = ++controlGeneration;
  // Invalidate HTTP/WS callbacks immediately; UDP cleanup completes in the serialized step.
  pairingAbortController?.abort();
  pairingAbortController = null;
  stopSync();
  const discoveryStop = stopDiscovery();
  return serialize(async () => {
    await discoveryStop;
    await startBoth(generation);
  });
}

export function restartComputerSync(): Promise<void> {
  const generation = ++controlGeneration;
  pairingAbortController?.abort();
  pairingAbortController = null;
  stopSync();
  const discoveryStop = stopDiscovery();
  return serialize(async () => {
    await discoveryStop;
    await startBoth(generation);
  });
}

export function configureComputerServer(url: string, serverId?: string): Promise<void> {
  setServerUrl(url, serverId);
  return restartComputerSync();
}

export async function pairComputerServer(code: string, serverId?: string) {
  const generation = controlGeneration;
  pairingAbortController?.abort();
  const controller = new AbortController();
  pairingAbortController = controller;
  let result: Awaited<ReturnType<typeof pairServer>>;
  try {
    result = await pairServer(code, serverId, controller.signal);
  } finally {
    if (pairingAbortController === controller) pairingAbortController = null;
  }
  if (generation !== controlGeneration || !isSyncEnabled()) {
    throw new DOMException('Pairing run was cancelled', 'AbortError');
  }
  savePairingToken(result.serverId, result.token);
  await restartComputerSync();
  return result;
}

export async function rescanComputerServers() {
  if (!isSyncEnabled()) return;
  await restartDiscovery();
}

// Kept for callers that only need the preference without importing lifecycle internals.
export { isSyncEnabled } from './sync-preference';
