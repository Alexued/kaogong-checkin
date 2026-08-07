export const ROOT_TAB_PATHS = new Set(['/', '/timer', '/drill', '/settings']);

export type BackAction =
  | { type: 'minimize' }
  | { type: 'navigate'; path: string };

export interface BackDismissLayer {
  click(): void;
  dataset?: { backPriority?: string };
}

export function normalizeParentPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : null;
}

export function resolveBackAction(path: string, parentPath: unknown): BackAction {
  if (ROOT_TAB_PATHS.has(path)) return { type: 'minimize' };
  return { type: 'navigate', path: normalizeParentPath(parentPath) || '/' };
}

/** Close the highest-priority dismissible UI layer before changing routes. */
export function dismissTopBackLayer(layers: Iterable<BackDismissLayer>): boolean {
  let topLayer: BackDismissLayer | null = null;
  let topPriority = Number.NEGATIVE_INFINITY;

  for (const layer of layers) {
    const priority = Number(layer.dataset?.backPriority || 0);
    const normalizedPriority = Number.isFinite(priority) ? priority : 0;
    if (normalizedPriority >= topPriority) {
      topLayer = layer;
      topPriority = normalizedPriority;
    }
  }

  if (!topLayer) return false;
  topLayer.click();
  return true;
}

interface ParentRouter {
  currentRoute: { value: { meta: Record<string, unknown> } };
  replace(path: string): Promise<unknown>;
}

export function navigateToParent(router: ParentRouter): Promise<unknown> {
  const parent = normalizeParentPath(router.currentRoute.value.meta.parentPath) || '/';
  return router.replace(parent);
}
