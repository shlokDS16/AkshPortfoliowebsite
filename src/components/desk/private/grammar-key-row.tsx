"use client";

import type { TokenKey } from "@/modules/capture/client";

const KEYS: TokenKey[] = ["$", "#", "t:", "l:", "p:", "r:", "v:"];
/** The keys whose letter alone does not say what they do. */
const KEY_LABEL: Partial<Record<TokenKey, string>> = { "r:": "r: read", "v:": "v: video" };

/** Docked at thumb height above the keyboard; mousedown is cancelled so the field keeps focus. */
export function GrammarKeyRow({ onInsert }: { onInsert(token: TokenKey): void }) {
  return (
    <div role="group" aria-label="Insert a grammar key" className="grid grid-cols-7 gap-1.5">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={KEY_LABEL[key]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(key)}
          className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-sm border border-rule-strong bg-surface px-1 font-mono text-data text-ink transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale)"
        >
          {key}
        </button>
      ))}
    </div>
  );
}
