/** Small token guard used by every asynchronous sync callback. */
export class SyncGeneration {
  private current = 0;

  begin(): number {
    this.current += 1;
    return this.current;
  }

  invalidate(): number {
    this.current += 1;
    return this.current;
  }

  isCurrent(generation: number): boolean {
    return generation === this.current;
  }
}
