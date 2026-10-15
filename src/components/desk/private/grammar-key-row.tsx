"use client";

import type { TokenKey } from "@/modules/capture/client";

const KEYS: TokenKey[] = ["$", "#", "t:", "l:", "p:", "r:"];
/** The one key whose letter alone does not say what it does. */
const KEY_LABEL: Partial<Record<TokenKey, string>> = { "r:": "r: read" };

/** Docked at thumb height above the keyboard; mousedown is cancelled so the field keeps focus. */
export function GrammarKeyRow({ onInsert }: { onInsert(token: TokenKey): void }) {
  return (
    <div role="group" aria-label="Insert a grammar key" className="flex gap-2">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={KEY_LABEL[key]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(key)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-rule-strong bg-surface px-2 font-mono text-data text-ink transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale)"
        >
          {key}
        </button>
      ))}
    </div>
  );
}
