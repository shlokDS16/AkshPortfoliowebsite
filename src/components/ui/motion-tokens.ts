// JS mirror of the motion tokens in globals.css (motion.test.tsx keeps them equal). Seconds, for Motion.
export const MOTION = { fast: 0.12, base: 0.18, slow: 0.22 } as const;
export const EASE_SNAP = [0.2, 0, 0, 1] as const;
export const EASE_SNAP_IN = [0.3, 0, 1, 1] as const;
export const easeCss = (curve: readonly number[]) => `cubic-bezier(${curve.join(", ")})`;
