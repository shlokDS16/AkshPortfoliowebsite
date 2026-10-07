import { EASE_SNAP, EASE_SNAP_IN, MOTION } from "./motion-tokens";

// design-dna 10.2 / 10.4. Reduced motion: one 120 ms opacity fade in, instant close.
const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: MOTION.fast } },
  exit: { opacity: 0, transition: { duration: 0 } },
} as const;

export function drawerMotion(reduced: boolean | null) {
  if (reduced) return fade;
  return {
    initial: { clipPath: "inset(0 0 100% 0)", y: -8 },
    animate: { clipPath: "inset(0 0 0% 0)", y: 0, transition: { duration: MOTION.base, ease: EASE_SNAP } },
    exit: { clipPath: "inset(0 0 100% 0)", y: -8, transition: { duration: MOTION.fast, ease: EASE_SNAP_IN } },
  } as const;
}

export function cardMotion(reduced: boolean | null) {
  if (reduced) return fade;
  return {
    initial: { clipPath: "inset(0 0 100% 0)", y: -6 },
    animate: { clipPath: "inset(0 0 0% 0)", y: 0, transition: { duration: MOTION.slow, ease: EASE_SNAP } },
    exit: { clipPath: "inset(0 0 100% 0)", y: -6, transition: { duration: MOTION.fast, ease: EASE_SNAP_IN } },
  } as const;
}

export function sheetMotion(reduced: boolean | null) {
  if (reduced) return fade;
  return {
    initial: { y: "100%", opacity: 0.9999 },
    animate: { y: "0%", opacity: 1, transition: { duration: MOTION.slow, ease: EASE_SNAP } },
    exit: { y: "100%", opacity: 0.9999, transition: { duration: MOTION.fast, ease: EASE_SNAP_IN } },
  } as const;
}

export function scrimMotion(reduced: boolean | null) {
  if (reduced) return fade;
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: MOTION.fast } },
    exit: { opacity: 0, transition: { duration: MOTION.fast, ease: EASE_SNAP_IN } },
  } as const;
}
