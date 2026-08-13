import { readonly, shallowRef } from 'vue';

export type AppDialogVariant = 'neutral' | 'warning' | 'danger';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: AppDialogVariant;
  details?: string[];
  /** Require a visible button decision; backdrop and Android back cannot cancel. */
  explicitDecision?: boolean;
}

export interface ActiveAppDialog extends Required<Omit<ConfirmDialogOptions, 'details' | 'explicitDecision'>> {
  id: number;
  details: string[];
  explicitDecision: boolean;
}

interface QueuedDialog {
  dialog: ActiveAppDialog;
  resolve: (accepted: boolean) => void;
}

const active = shallowRef<ActiveAppDialog | null>(null);
const queue: QueuedDialog[] = [];
let activeRequest: QueuedDialog | null = null;
let nextId = 0;
let waitingForExit = false;

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
        explicitDecision: options.explicitDecision === true,
      },
      resolve,
    });
    if (!activeRequest && !waitingForExit) showNextDialog();
  });
}

export function settleAppDialog(accepted: boolean) {
  const request = activeRequest;
  if (!request) return;
  activeRequest = null;
  active.value = null;
  request.resolve(accepted);
  waitingForExit = queue.length > 0;
}

/** Called by the host after the previous panel has fully left the DOM. */
export function continueAppDialogQueue() {
  if (!waitingForExit) return;
  waitingForExit = false;
  showNextDialog();
}

export function cancelAllDialogs() {
  if (activeRequest) activeRequest.resolve(false);
  activeRequest = null;
  for (const request of queue.splice(0)) request.resolve(false);
  active.value = null;
  waitingForExit = false;
}
