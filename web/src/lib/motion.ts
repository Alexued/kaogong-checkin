import { Capacitor } from '@capacitor/core';

export const MOTION = {
  quick: 160,
  page: 320,
  scene: 420,
  taskLift: 220,
  sheetDelay: 40,
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
};

export async function runViewTransition(update: () => void | Promise<void>): Promise<void> {
  const documentWithTransitions = document as ViewTransitionDocument;
  if (
    Capacitor.isNativePlatform()
    || !documentWithTransitions.startViewTransition
    || prefersReducedMotion()
  ) {
    await update();
    return;
  }
  await documentWithTransitions.startViewTransition(update).finished;
}
