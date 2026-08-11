import { readonly, shallowRef } from 'vue';

export type AppDialogVariant = 'neutral' | 'warning' | 'danger';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: AppDialogVariant;
  details?: string[];
}

export interface ActiveAppDialog extends Required<Omit<ConfirmDialogOptions, 'details'>> {
  id: number;
  details: string[];
}

interface QueuedDialog {
  dialog: ActiveAppDialog;
  resolve: (accepted: boolean) => void;
}

const active = shallowRef<ActiveAppDialog | null>(null);
const queue: QueuedDialog[] = [];
let activeRequest: QueuedDialog | null = null;
let nextId = 0;

export const activeAppDialog = readonly(active);

function showNextDialog() {
  activeRequest = queue.shift() || null;
  active.value = activeRequest?.dialog || null;
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({
      dialog: {
        id: ++nextId,
        title: options.title.trim(),
        message: options.message.trim(),
        confirmLabel: options.confirmLabel.trim(),
        cancelLabel: (options.cancelLabel || '取消').trim(),
        variant: options.variant || 'neutral',
        details: (options.details || []).map((item) => item.trim()).filter(Boolean),
      },
      resolve,
    });
    if (!activeRequest) showNextDialog();
  });
}

export function settleAppDialog(accepted: boolean) {
  const request = activeRequest;
  if (!request) return;
  activeRequest = null;
  active.value = null;
  request.resolve(accepted);
  queueMicrotask(showNextDialog);
}

export function cancelAllDialogs() {
  if (activeRequest) activeRequest.resolve(false);
  activeRequest = null;
  for (const request of queue.splice(0)) request.resolve(false);
  active.value = null;
}
