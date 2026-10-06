"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { useState } from "react";

/** design-dna s17 item 16: no theme toggle in v1; .light/.dark on <html> exist for testing only. */
export function ThemeSwitch() {
  const [mode, setMode] = useState("os");
  function apply(next: string) {
    document.documentElement.classList.remove("light", "dark");
    if (next !== "os") document.documentElement.classList.add(next);
    setMode(next);
  }
  return (
    <SegmentedControl
      aria-label="Theme"
      value={mode}
      onValueChange={apply}
      items={[
        { value: "os", label: "OS" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}
