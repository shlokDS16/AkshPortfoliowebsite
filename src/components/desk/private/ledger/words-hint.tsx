"use client";

import { useEffect, useMemo, useState } from "react";
import { lintWords } from "@/modules/compliance/client";

// A hint, never a block (spec s33.8, D44): while he writes words that the entry will seal, a sentence the publishing lint would
// refuse is named, with the rule, because sealed words cannot be changed later. The gate decides; nothing here stops a submit.

const SHOWN = 3;
const SENTENCE_MAX = 160;
const PAUSE_MS = 400;

export const wordsHintText = (title: string) =>
  `If this idea is ever shown as a case study, this sentence would keep it off the site (${title}). Sealed words cannot be changed later.`;

const clip = (s: string) => (s.length > SENTENCE_MAX ? `${s.slice(0, SENTENCE_MAX - 1).trimEnd()}…` : s);

/** `text` is what he has typed so far. The live region is always present, so a hint that appears is announced politely. */
export function SealedWordsHint({ text }: { text: string }) {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const found = useMemo(() => lintWords(settled), [settled]);
  const rest = found.length - SHOWN;
  return (
    <div aria-live="polite" className="space-y-2">
      {found.slice(0, SHOWN).map((f, i) => (
        <div key={`${i}:${f.sentence}`} className="border-l-2 border-warn pl-3 text-small text-ink">
          <p className="text-ink-body">{clip(f.sentence)}</p>
          <p className="text-ink-muted">{wordsHintText(f.title)}</p>
        </div>
      ))}
      {rest > 0 ? <p className="text-small text-ink-muted">{`${rest} more ${rest === 1 ? "sentence is" : "sentences are"} flagged in the same way.`}</p> : null}
    </div>
  );
}
