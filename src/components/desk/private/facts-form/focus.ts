"use client";

import { useEffect, useRef } from "react";

/** Focus an element by id once the render that creates it has landed (Add focuses the new row, Remove the next one). */
export function useFocusNext(): (id: string) => void {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!pending.current) return;
    document.getElementById(pending.current)?.focus();
    pending.current = null;
  });
  return (id: string) => {
    pending.current = id;
  };
}

/** After removing `index` from a list of `length` rows: the row that takes its place, else the one before, else null. */
export function neighbour(index: number, length: number): number | null {
  if (length <= 1) return null;
  return index < length - 1 ? index : index - 1;
}

export type Focus = ReturnType<typeof useFocusNext>;
