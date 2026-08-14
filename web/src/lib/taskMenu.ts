export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface TaskMenuViewport extends Size {
  left?: number;
  top?: number;
}

export interface TaskMenuPosition extends Point {
  originX: number;
  originY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

export function positionTaskMenu(
  anchor: Point,
  menu: Size,
  viewport: TaskMenuViewport,
  edge = 12,
  bottomClearance = 86,
): TaskMenuPosition {
  const viewportLeft = viewport.left || 0;
  const viewportTop = viewport.top || 0;
  const minLeft = viewportLeft + edge;
  const maxLeft = viewportLeft + viewport.width - menu.width - edge;
  const minTop = viewportTop + edge;
  const maxTop = viewportTop + viewport.height - menu.height - bottomClearance;
  let x = anchor.x + 12;
  let y = anchor.y + 10;
  if (x > maxLeft) x = anchor.x - menu.width - 12;
  if (y > maxTop) y = anchor.y - menu.height - 10;
  x = clamp(x, minLeft, maxLeft);
  y = clamp(y, minTop, maxTop);
  return {
    x,
    y,
    originX: clamp(anchor.x - x, 16, menu.width - 16),
    originY: clamp(anchor.y - y, 16, menu.height - 16),
  };
}
