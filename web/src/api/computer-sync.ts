/** Single lifecycle entry point for computer sync and LAN discovery. */
import { pairServer, setServerUrl } from './client';
import {
  restartDiscovery,
  startDiscovery,
  stopDiscovery,
} from './discover';
import { initializeLocalStateAsync, startSync, stopSync } from './sync';
import { isSyncEnabled, persistSyncEnabled } from './sync-preference';
import { savePairingToken } from './pairing-storage';
import { cancelActiveLanAppUpdate, cancelLanUpdateRequests } from './update';

let controlGeneration = 0;
let controlChain: Promise<void> = Promise.resolve();
let pairingAbortController: AbortController | null = null;
const LAN_DOWNLOAD_CANCEL_RETRY_DELAYS_MS = [250, 500, 1000] as const;
let lanDownloadCancellationGeneration = 0;
let lanDownloadRetryTimer: ReturnType<typeof setTimeout> | null = null;
let resolveLanDownloadRetryWait: ((ready: boolean) => void) | null = null;

function beginLanDownloadCancellationRun(): number {
  lanDownloadCancellationGeneration += 1;
  if (lanDownloadRetryTimer) {
    clearTimeout(lanDownloadRetryTimer);
    lanDownloadRetryTimer = null;
  }
  if (resolveLanDownloadRetryWait) {
    const resolve = resolveLanDownloadRetryWait;
    resolveLanDownloadRetryWait = null;
    resolve(false);
  }
  return lanDownloadCancellationGeneration;
}

function waitForLanDownloadCancellationRetry(delayMs: number, generation: number): Promise<boolean> {
  if (generation !== lanDownloadCancellationGeneration || isSyncEnabled()) return Promise.resolve(false);
  return new Promise((resolve) => {
    resolveLanDownloadRetryWait = resolve;
    lanDownloadRetryTimer = setTimeout(() => {
      lanDownloadRetryTimer = null;
      if (resolveLanDownloadRetryWait === resolve) resolveLanDownloadRetryWait = null;
      resolve(generation === lanDownloadCancellationGeneration && !isSyncEnabled());
    }, delayMs);
  });
}

async function cancelLanDownloadWhileDisabled(generation: number): Promise<void> {
  for (let attempt = 0; attempt <= LAN_DOWNLOAD_CANCEL_RETRY_DELAYS_MS.length; attempt += 1) {
    if (generation !== lanDownloadCancellationGeneration || isSyncEnabled()) return;
    try {
      await cancelActiveLanAppUpdate();
      return;
    } catch {
      if (attempt === LAN_DOWNLOAD_CANCEL_RETRY_DELAYS_MS.length) return;
      const ready = await waitForLanDownloadCancellationRetry(
        LAN_DOWNLOAD_CANCEL_RETRY_DELAYS_MS[attempt],
        generation,
      );
      if (!ready) return;
    }
  }
}

function serialize(operation: () => Promise<void>): Promise<void> {
  const result = controlChain.then(operation, operation);
  controlChain = result.catch(() => {});
  return result;
}

async function startBoth(generation: number) {
  if (generation !== controlGeneration || !isSyncEnabled()) return;
  await Promise.all([startSync(), startDiscovery()]);
}

export async function initializeComputerSync(): Promise<void> {
  await initializeLocalStateAsync();
  const generation = ++controlGeneration;
  const cancellationGeneration = beginLanDownloadCancellationRun();
  if (!isSyncEnabled()) {
    cancelLanUpdateRequests();
    stopSync();
    await Promise.all([
      stopDiscovery(),
      cancelLanDownloadWhileDisabled(cancellationGeneration),
    ]);
    return;
  }
  await serialize(() => startBoth(generation));
}

export function setComputerSyncEnabled(enabled: boolean): Promise<void> {
  persistSyncEnabled(enabled);
  const generation = ++controlGeneration;
  const cancellationGeneration = beginLanDownloadCancellationRun();
  // Invalidate HTTP/WS callbacks immediately; UDP cleanup completes in the serialized step.
  cancelLanUpdateRequests();
  const downloadCancellation = enabled
    ? Promise.resolve()
    : cancelLanDownloadWhileDisabled(cancellationGeneration);
  pairingAbortController?.abort();
  pairingAbortController = null;
  stopSync();
  const discoveryStop = stopDiscovery();
  return serialize(async () => {
    await Promise.all([discoveryStop, downloadCancellation]);
    await startBoth(generation);
  });
}

export function restartComputerSync(): Promise<void> {
  const generation = ++controlGeneration;
  cancelLanUpdateRequests();
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
  if (!isSyncEnabled()) throw new DOMException('Computer sync is disabled', 'AbortError');
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
