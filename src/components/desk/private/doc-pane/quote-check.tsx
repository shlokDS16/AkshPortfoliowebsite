"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkQuotesAction, type QuoteCheckResult } from "@/modules/documents/actions";
import { normaliseText } from "@/modules/documents/client";
import type { CheckableFact } from "../facts-form/checkable";
import { locatorPage } from "./locator-page";

type Row = { fact: CheckableFact; pageNo: number; found: QuoteCheckResult | undefined };
type Shown = { kind: "none" } | { kind: "failed" } | { kind: "rows"; rows: Row[] };
type Props = { documentId: string; title: string; facts: CheckableFact[]; currentPage: number; onGo(pageNo: number): void };

/** Facts whose source is named like this document and that carry a quoted line. The page is the fact's own locator, else the page open now. */
export function checkable(facts: CheckableFact[], title: string, currentPage: number) {
  return facts
    .filter((f) => f.quote.trim() !== "" && normaliseText(f.doc) === normaliseText(title))
    .map((fact) => ({ fact, pageNo: locatorPage(fact.locator) ?? currentPage }));
}

/** "Check my quotes": each quoted line against the page it cites, word for word, and the value against the figures printed there. */
export function QuoteCheck({ documentId, title, facts, currentPage, onGo }: Props) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    const items = checkable(facts, title, currentPage);
    if (items.length === 0) return setShown({ kind: "none" });
    setBusy(true);
    const results = await checkQuotesAction(
      documentId,
      items.map(({ fact, pageNo }) => ({ factId: fact.id, pageNo, quote: fact.quote, valueText: fact.value })),
    ).catch(() => []);
    setShown(results.length === 0 ? { kind: "failed" } : { kind: "rows", rows: items.map((i) => ({ ...i, found: results.find((r) => r.factId === i.fact.id) })) });
    setBusy(false);
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={run} disabled={busy}>
        Check my quotes
      </Button>
      <div aria-live="polite" className="space-y-2">
        {shown?.kind === "none" ? (
          <p className="text-small text-ink-muted">
            No fact cites this document with a quoted line yet. Use it as a source, pick it on a fact and type the line as printed.
          </p>
        ) : null}
        {shown?.kind === "failed" ? (
          <p role="alert" className="text-small text-bad">
            The check could not run. Try again.
          </p>
        ) : null}
        {shown?.kind === "rows" ? (
          <ul className="space-y-2">
            {shown.rows.map(({ fact, pageNo, found }) => (
              <li key={fact.id} className="space-y-0.5 rounded-sm border border-rule p-2 text-small">
                <p className="text-ink">
                  <span className="font-mono text-mono-tag">{fact.id}</span> {fact.label}
                </p>
                <Verdict ok={found?.quoteFound ?? false} yes={`found on p. ${pageNo}`} no={`not on p. ${pageNo}`} />
                <Verdict ok={found?.valueFound ?? false} yes="value printed there" no="value not printed there" />
                <Button variant="link" size="sm" onClick={() => onGo(pageNo)}>
                  Open p. {pageNo}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function Verdict({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  const Icon = ok ? Check : TriangleAlert;
  return (
    <p className={ok ? "flex items-center gap-1.5 text-ink-body" : "flex items-center gap-1.5 text-bad"}>
      <Icon aria-hidden strokeWidth={1.5} className="size-4 shrink-0" />
      <span>{ok ? yes : no}</span>
    </p>
  );
}
