import type { SyncMessage } from '../types';

export type QueuedSyncMessage = SyncMessage & { clientMutationId: string };

function fallbackId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createMutationId(): string {
  return globalThis.crypto?.randomUUID?.() || fallbackId();
}

export function withMutationId(message: SyncMessage): QueuedSyncMessage {
  return {
    ...message,
    clientMutationId: message.clientMutationId || createMutationId(),
  };
}

export function queueEntityKey(message: SyncMessage): string {
  if (message.entity === 'settings') return 'settings';
  const id = message.payload?.id;
  return `${message.entity}:${typeof id === 'string' ? id : message.clientMutationId || ''}`;
}

/** Keep only the final mutation for an entity at its latest position in the queue. */
export function compactQueue(
  queue: readonly QueuedSyncMessage[],
  incoming: SyncMessage,
): QueuedSyncMessage[] {
  const next = withMutationId(incoming);
  const key = queueEntityKey(next);
  const index = queue.findIndex((item) => queueEntityKey(item) === key);
  if (index < 0) return [...queue, next];

  return [...queue.slice(0, index), ...queue.slice(index + 1), next];
}

export function normalizeQueue(value: unknown): QueuedSyncMessage[] {
  if (!Array.isArray(value)) return [];
  let normalized: QueuedSyncMessage[] = [];
  for (const candidate of value) {
    if (
      !candidate
      || (candidate.kind !== 'upsert' && candidate.kind !== 'delete')
      || typeof candidate.entity !== 'string'
      || !candidate.payload
    ) continue;
    normalized = compactQueue(normalized, candidate as SyncMessage);
  }
  return normalized;
}
