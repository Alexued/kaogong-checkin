export const ROOT_TAB_PATHS = new Set(['/', '/timer', '/drill', '/settings']);

export type BackAction =
  | { type: 'minimize' }
  | { type: 'navigate'; path: string };

export function normalizeParentPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : null;
}

export function resolveBackAction(path: string, parentPath: unknown): BackAction {
  if (ROOT_TAB_PATHS.has(path)) return { type: 'minimize' };
  return { type: 'navigate', path: normalizeParentPath(parentPath) || '/' };
}

interface ParentRouter {
  currentRoute: { value: { meta: Record<string, unknown> } };
  replace(path: string): Promise<unknown>;
}

export function navigateToParent(router: ParentRouter): Promise<unknown> {
  const parent = normalizeParentPath(router.currentRoute.value.meta.parentPath) || '/';
  return router.replace(parent);
}
