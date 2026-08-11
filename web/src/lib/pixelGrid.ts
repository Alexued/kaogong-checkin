export type PixelGridPreset = 'wave' | 'spiral' | 'pulse';
export type PixelGridPatternPreset = 'confirm' | 'dissolve' | 'arrival';

export interface PixelGridAnimation {
  delays: readonly number[];
  duration: number;
}

export interface PixelGridPlaybackState {
  active?: boolean;
  reduceMotion?: boolean;
}

export interface PixelGridPattern {
  groups: readonly (readonly number[])[];
  frames: readonly (readonly number[])[];
  frameDuration: number;
  transitionDuration: number;
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

function normalizePixelCells(cells: readonly number[]): number[] {
  return [...new Set(cells.filter((cell) => Number.isInteger(cell) && cell >= 1 && cell <= 9))]
    .sort((left, right) => left - right);
}

/** Compile Pattern groups with the same grouping rules as SwiftPixelGrid. */
export function compilePixelPattern(groups: readonly (readonly number[])[]): number[][] {
  if (!groups.length) return [];

  if (groups.length === 1) {
    return groups[0].map((cell) => normalizePixelCells([cell]));
  }

  if (groups.every((group) => group.length === 1)) {
    return [normalizePixelCells(groups.flat()), []];
  }

  return groups.map(normalizePixelCells);
}

function definePixelPattern(
  groups: readonly (readonly number[])[],
  frameDuration: number,
  transitionDuration: number,
): PixelGridPattern {
  return {
    groups,
    frames: compilePixelPattern(groups),
    frameDuration,
    transitionDuration,
  };
}

/**
 * Interaction patterns adapted from SwiftPixelGrid's discrete Pattern engine.
 * Each preset ends on its meaningful settled state so one-shot playback can
 * stop without a visual jump.
 */
export const PIXEL_GRID_PATTERNS: Readonly<Record<PixelGridPatternPreset, PixelGridPattern>> = {
  confirm: definePixelPattern([
    [5],
    [2, 4, 5, 6, 8],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  ], 0.095, 0.08),
  dissolve: definePixelPattern([
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [2, 4, 5, 6, 8],
    [5],
    [],
  ], 0.075, 0.065),
  arrival: definePixelPattern([
    [7],
    [7, 8],
    [4, 7, 8],
    [4, 5, 7, 8],
    [1, 4, 5, 7, 8],
    [1, 2, 4, 5, 7, 8],
    [1, 2, 3, 4, 5, 7, 8],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  ], 0.055, 0.05),
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

export function pixelPatternCycleDuration(pattern: PixelGridPatternPreset): number {
  const animation = PIXEL_GRID_PATTERNS[pattern];
  return animation.frames.length * animation.frameDuration;
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

export function pixelPatternFrameIndexAt(
  elapsedTime: number,
  pattern: PixelGridPatternPreset,
  once = false,
): number | null {
  const animation = PIXEL_GRID_PATTERNS[pattern];
  if (!animation.frames.length) return null;

  const elapsed = Math.max(0, Number.isFinite(elapsedTime) ? elapsedTime : 0);
  const cycleDuration = pixelPatternCycleDuration(pattern);
  if (once && elapsed >= cycleDuration) return animation.frames.length - 1;

  const cycleTime = positiveRemainder(elapsed, cycleDuration);
  return Math.min(
    Math.floor(cycleTime / animation.frameDuration),
    animation.frames.length - 1,
  );
}

/** Fill a nine-value target with a discrete Pattern frame at absolute time. */
export function pixelPatternIntensitiesAt(
  elapsedTime: number,
  pattern: PixelGridPatternPreset,
  state: PixelGridPlaybackState = {},
  target: number[] = new Array<number>(9),
  once = false,
): number[] {
  const active = state.active ?? true;
  const reduceMotion = state.reduceMotion ?? false;
  const animation = PIXEL_GRID_PATTERNS[pattern];

  target.fill(0);
  if (!active) return target;

  const activeCells = reduceMotion
    ? normalizePixelCells(animation.frames.flat())
    : animation.frames[pixelPatternFrameIndexAt(elapsedTime, pattern, once) ?? -1] ?? [];

  for (const cell of activeCells) target[cell - 1] = 1;
  return target;
}
