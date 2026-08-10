export type PixelGridPreset = 'wave' | 'spiral' | 'pulse';

export interface PixelGridAnimation {
  delays: readonly number[];
  duration: number;
}

export interface PixelGridPlaybackState {
  active?: boolean;
  reduceMotion?: boolean;
}

export const PIXEL_GRID_TRANSITION_DURATION = 0.3;
export const PIXEL_GRID_FADE_OUT_PADDING = 0.05;

/**
 * A focused Web adaptation of the SwiftPixelGrid timing presets. Values are
 * seconds and cells are ordered left-to-right, top-to-bottom.
 */
export const PIXEL_GRID_PRESETS: Readonly<Record<PixelGridPreset, PixelGridAnimation>> = {
  wave: {
    delays: [0, 0.12, 0.24, 0, 0.12, 0.24, 0, 0.12, 0.24],
    duration: 0.2,
  },
  spiral: {
    delays: [0, 0.08, 0.16, 0.56, 0.64, 0.24, 0.48, 0.4, 0.32],
    duration: 0.18,
  },
  pulse: {
    delays: [0.24, 0.12, 0.24, 0.12, 0, 0.12, 0.24, 0.12, 0.24],
    duration: 0.2,
  },
};

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function curveX(parameter: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * parameter * parameter * 0.58 + parameter ** 3;
}

function curveY(parameter: number): number {
  const inverse = 1 - parameter;
  return 3 * inverse * parameter * parameter + parameter ** 3;
}

function curveXSlope(parameter: number): number {
  return 3 * 1.16 * parameter + 3 * (1 - 1.74) * parameter * parameter;
}

/** Solve cubic-bezier(0, 0, 0.58, 1) for a time-domain progress value. */
export function cubicEaseOut(progress: number): number {
  const x = clampUnit(progress);
  if (x === 0 || x === 1) return x;

  let parameter = x;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = curveX(parameter) - x;
    const slope = curveXSlope(parameter);
    if (Math.abs(error) < 1e-7) return curveY(parameter);
    if (Math.abs(slope) < 1e-7) break;
    parameter -= error / slope;
  }

  let lower = 0;
  let upper = 1;
  parameter = x;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const current = curveX(parameter);
    if (Math.abs(current - x) < 1e-7) break;
    if (current < x) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return curveY(parameter);
}

export function pixelGridCycleDuration(preset: PixelGridPreset): number {
  const animation = PIXEL_GRID_PRESETS[preset];
  const maximumDelay = Math.max(...animation.delays);
  return 2 * (maximumDelay + animation.duration) + PIXEL_GRID_FADE_OUT_PADDING;
}

function positiveRemainder(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder >= 0 ? remainder : remainder + modulus;
}

function intensityForTiming(
  elapsedTime: number,
  delay: number,
  holdTime: number,
  cycleDuration: number,
): number {
  const localTime = positiveRemainder(elapsedTime - delay, cycleDuration);

  if (localTime < holdTime) {
    if (localTime >= PIXEL_GRID_TRANSITION_DURATION) return 1;
    return cubicEaseOut(localTime / PIXEL_GRID_TRANSITION_DURATION);
  }

  const fadeOutTime = localTime - holdTime;
  if (fadeOutTime >= PIXEL_GRID_TRANSITION_DURATION) return 0;
  return 1 - cubicEaseOut(fadeOutTime / PIXEL_GRID_TRANSITION_DURATION);
}

export function pixelGridIntensityAt(
  elapsedTime: number,
  delay: number,
  preset: PixelGridPreset,
): number {
  const animation = PIXEL_GRID_PRESETS[preset];
  const maximumDelay = Math.max(...animation.delays);
  const holdTime = maximumDelay + animation.duration;
  return intensityForTiming(
    Math.max(0, Number.isFinite(elapsedTime) ? elapsedTime : 0),
    delay,
    holdTime,
    2 * holdTime + PIXEL_GRID_FADE_OUT_PADDING,
  );
}

/**
 * Fill a nine-value target with the frame at an absolute elapsed time. Passing
 * a target lets the renderer reuse one allocation across all animation frames.
 */
export function pixelGridIntensitiesAt(
  elapsedTime: number,
  preset: PixelGridPreset,
  state: PixelGridPlaybackState = {},
  target: number[] = new Array<number>(9),
): number[] {
  const active = state.active ?? true;
  const reduceMotion = state.reduceMotion ?? false;
  const animation = PIXEL_GRID_PRESETS[preset];
  const maximumDelay = Math.max(...animation.delays);
  const holdTime = maximumDelay + animation.duration;
  const cycleDuration = 2 * holdTime + PIXEL_GRID_FADE_OUT_PADDING;
  const normalizedElapsed = Math.max(0, Number.isFinite(elapsedTime) ? elapsedTime : 0);

  for (let index = 0; index < 9; index += 1) {
    target[index] = reduceMotion
      ? 1
      : active
        ? intensityForTiming(normalizedElapsed, animation.delays[index], holdTime, cycleDuration)
        : 0;
  }
  return target;
}
