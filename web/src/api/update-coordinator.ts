export type UpdateCheckMode = 'automatic' | 'manual';

export interface UpdateCoordinatorOptions<T> {
  debounceMs?: number;
  canCheckAutomatically(): boolean;
  automaticFingerprint(): string;
  performCheck(signal: AbortSignal): Promise<T>;
  onStart?(mode: UpdateCheckMode): void;
  onSuccess?(value: T, mode: UpdateCheckMode): void;
  onError?(error: unknown, mode: UpdateCheckMode): void;
  onCancelled?(mode: UpdateCheckMode | null): void;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Coordinates update checks for one mounted settings session.
 * Only the newest generation may publish state back to the UI.
 */
export class UpdateCoordinator<T> {
  private readonly options: UpdateCoordinatorOptions<T>;
  private readonly debounceMs: number;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private scheduledFingerprint = '';
  private activeFingerprint = '';
  private completedFingerprint = '';
  private activeMode: UpdateCheckMode | null = null;
  private disposed = false;

  constructor(options: UpdateCoordinatorOptions<T>) {
    this.options = options;
    this.debounceMs = options.debounceMs ?? 400;
  }

  scheduleAutomatic(refresh = false): boolean {
    if (this.disposed || !this.options.canCheckAutomatically()) return false;
    const fingerprint = this.options.automaticFingerprint();
    if (!fingerprint) return false;
    if (refresh) this.completedFingerprint = '';
    if (
      fingerprint === this.scheduledFingerprint
      || fingerprint === this.activeFingerprint
      || fingerprint === this.completedFingerprint
    ) return false;

    this.cancelCurrent();
    const generation = this.generation;
    this.scheduledFingerprint = fingerprint;
    this.timer = setTimeout(() => {
      if (this.disposed || generation !== this.generation) return;
      this.timer = null;
      this.scheduledFingerprint = '';
      if (!this.options.canCheckAutomatically() || this.options.automaticFingerprint() !== fingerprint) return;
      void this.execute('automatic', fingerprint, generation);
    }, this.debounceMs);
    return true;
  }

  checkNow(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.completedFingerprint = '';
    this.cancelCurrent();
    return this.execute('manual', '', this.generation);
  }

  cancel(resetAutomaticDedupe = false) {
    if (resetAutomaticDedupe) this.completedFingerprint = '';
    this.cancelCurrent();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.completedFingerprint = '';
    this.cancelCurrent();
  }

  private cancelCurrent() {
    const cancelledMode = this.activeMode;
    const hadPendingWork = Boolean(this.timer || this.controller);
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort(new DOMException('Update check was cancelled', 'AbortError'));
    this.controller = null;
    this.scheduledFingerprint = '';
    this.activeFingerprint = '';
    this.activeMode = null;
    if (hadPendingWork) this.options.onCancelled?.(cancelledMode);
  }

  private async execute(mode: UpdateCheckMode, fingerprint: string, generation: number): Promise<void> {
    if (this.disposed || generation !== this.generation) return;
    const controller = new AbortController();
    this.controller = controller;
    this.activeFingerprint = fingerprint;
    this.activeMode = mode;
    this.options.onStart?.(mode);
    try {
      const value = await this.options.performCheck(controller.signal);
      if (this.disposed || generation !== this.generation || controller.signal.aborted) return;
      if (mode === 'automatic') this.completedFingerprint = fingerprint;
      this.options.onSuccess?.(value, mode);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      if (controller.signal.aborted || isAbortError(error)) this.options.onCancelled?.(mode);
      else this.options.onError?.(error, mode);
    } finally {
      if (generation !== this.generation) return;
      if (this.controller === controller) this.controller = null;
      this.activeFingerprint = '';
      this.activeMode = null;
    }
  }
}
