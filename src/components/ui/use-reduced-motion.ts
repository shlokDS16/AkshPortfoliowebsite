"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const hasMatchMedia = () => typeof window.matchMedia === "function";
const subscribe = (onChange: () => void) => {
  if (!hasMatchMedia()) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/** Read per render (Motion's own hook caches the first answer process-wide). Server: no preference. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => hasMatchMedia() && window.matchMedia(QUERY).matches, () => false);
}
