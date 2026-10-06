"use client";

import { cn } from "@/lib/utils";
import * as m from "motion/react-m";
import { useId, type KeyboardEvent } from "react";
import { EASE_SNAP, MOTION } from "./motion-tokens";

type Item = { value: string; label: string; count?: number };
type Props = {
  value: string;
  onValueChange(value: string): void;
  items: Item[];
  size?: "sm" | "md";
  "aria-label": string;
};

/** Ink indicator slides between options (Motion layoutId, 220 ms); reduced motion makes it jump. */
export function SegmentedControl({ value, onValueChange, items, size = "md", "aria-label": label }: Props) {
  const group = useId();
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.value === value);
    const forward = event.key === "ArrowRight";
    // A value matching no item starts from the first (Right) or last (Left) option.
    const next = index === -1 ? items[forward ? 0 : items.length - 1] : items[(index + (forward ? 1 : items.length - 1)) % items.length];
    onValueChange(next.value);
    event.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex rounded-sm border border-rule-strong p-0.5">
      {items.map((item) => {
        const on = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={item.value}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative rounded-xs px-3 text-small transition-colors duration-(--motion-fast) ease-snap",
              size === "sm" ? "h-7 pointer-coarse:h-11" : "h-8 pointer-coarse:h-11",
              on ? "text-paper" : "text-ink hover:bg-surface-2",
            )}
          >
            {on ? (
              <m.span
                data-indicator
                layoutId={`segment-${group}`}
                className="absolute inset-0 rounded-xs bg-ink"
                transition={{ duration: MOTION.slow, ease: EASE_SNAP }}
              />
            ) : null}
            <span className="relative">
              {item.label}
              {item.count !== undefined ? <span className="ml-1 tabular-nums">{item.count}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
