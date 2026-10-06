import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/** Keyboard hint, fine pointers only (design-dna inventory A). */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("hidden rounded-xs border border-b-2 border-rule-strong px-1 font-mono text-mono-label text-ink-muted pointer-fine:inline-flex", className)}
      {...props}
    />
  );
}
