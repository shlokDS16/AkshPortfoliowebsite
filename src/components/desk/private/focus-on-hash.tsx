"use client";

import { useEffect } from "react";

/** design-dna 14: on gate failure, focus moves to the first failing sentence (#first-flag). */
export function FocusOnHash() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.focus();
  }, []);
  return null;
}
