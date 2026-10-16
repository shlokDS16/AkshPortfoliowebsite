"use client";

import type { TokenKey } from "@/modules/capture/client";

const KEYS: TokenKey[] = ["$", "#", "t:", "l:", "p:", "r:"];
/** Phase 5d (spec s8): v: (an own-channel video) is offered only while own videos are on. */
const VIDEO_KEY: TokenKey = "v:";
/** The keys whose letter alone does not say what they do. */
const KEY_LABEL: Partial<Record<TokenKey, string>> = { "r:": "r: read", "v:": "v: video" };

/** Docked at thumb height above the keyboard; mousedown is cancelled so the field keeps focus. */
export function GrammarKeyRow({ onInsert, videoKey = false }: { onInsert(token: TokenKey): void; videoKey?: boolean }) {
  const keys = videoKey ? [...KEYS, VIDEO_KEY] : KEYS;
  return (
    <div role="group" aria-label="Insert a grammar key" className={videoKey ? "grid grid-cols-7 gap-1.5" : "grid grid-cols-6 gap-1.5"}>
      {keys.map((key) => (
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
