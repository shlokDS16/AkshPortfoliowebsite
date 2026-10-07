"use client";

import { useEffect } from "react";

/** design-dna 14: after a gate run the redirect lands on #gate (the aside, tabIndex -1); focus moves there so the recorded decision is read first. */
export function FocusOnHash() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.focus();
  }, []);
  return null;
}
