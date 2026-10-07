"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReadPageResult } from "@/modules/documents/actions";
import { pageLabel } from "../inbox/page-label";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The page's text with the words of the last search marked. */
function Marked({ text, words }: { text: string; words: string[] }) {
  const used = words.filter((w) => w.length > 1);
  if (used.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${used.map(escapeRe).join("|")})`, "i"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-xs bg-warn-wash px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Props = { pageNo: number; pageCount: number | null; result: ReadPageResult | null; words: string[]; onPage(n: number): void };

/** The stepper (it sticks to the top of the pane while a long page scrolls) and one page of text as extracted: line breaks kept. */
export function PageView({ pageNo, pageCount, result, words, onPage }: Props) {
  const count = result?.ok ? result.pageCount : pageCount;
  // The typed page restarts from the page shown whenever that changes (the stepper, a search hit, a quote check).
  const [typed, setTyped] = useState({ for: pageNo, text: String(pageNo) });
  const text = typed.for === pageNo ? typed.text : String(pageNo);
  const go = (n: number) => onPage(Math.min(Math.max(1, n), count ?? Number.MAX_SAFE_INTEGER));
  return (
    <section aria-label="Page text" className="space-y-2">
      <div className="sticky top-0 z-(--z-sticky-key) flex items-end gap-2 border-b border-rule bg-paper py-2">
        <Button variant="outline" size="icon" aria-label="Previous page" disabled={pageNo <= 1} onClick={() => go(pageNo - 1)}>
          <ChevronLeft aria-hidden strokeWidth={1.5} />
        </Button>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(text);
            if (Number.isInteger(n)) go(n);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="pane-page" className="block">
              Page
            </Label>
            <Input
              id="pane-page"
              inputMode="numeric"
              value={text}
              onChange={(e) => setTyped({ for: pageNo, text: e.target.value })}
              className="w-16 text-center tabular-nums"
            />
          </div>
          <p className="pb-3 text-small text-ink-muted tabular-nums">{count ? `of ${count}` : ""}</p>
        </form>
        <Button variant="outline" size="icon" aria-label="Next page" disabled={count !== null && pageNo >= count} onClick={() => go(pageNo + 1)}>
          <ChevronRight aria-hidden strokeWidth={1.5} />
        </Button>
        {result?.ok && result.kind ? <p className="min-w-0 flex-1 truncate pb-3 text-right text-small text-ink-muted">{pageLabel({ kind: result.kind, basis: null })}</p> : null}
      </div>
      <div aria-live="polite" aria-busy={result === null} className="min-h-40">
        {result === null ? (
          <p className="text-small text-ink-muted">Loading page {pageNo}...</p>
        ) : result.ok ? (
          result.text.trim() === "" ? (
            <p className="text-small text-ink-muted">Page {pageNo} has no text. It may be a scan; the original has it.</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-data text-ink-body tabular-nums">
              <Marked text={result.text} words={words} />
            </pre>
          )
        ) : (
          <p role="alert" className="text-small text-bad">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
