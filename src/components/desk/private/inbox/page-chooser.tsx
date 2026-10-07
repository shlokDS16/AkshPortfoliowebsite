"use client";

import { useOptimistic, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_PAGE_BUDGET, type PageKind } from "@/modules/documents/client";
import { setBudgetAction } from "@/modules/ingestion/actions";
import { estimateReadyBy, formatReadyBy, GROQ_CAPS, TOKENS_PER_PAGE_DEFAULT, type InboxDoc } from "@/modules/ingestion/client";
import type { InboxActions } from "./types";
import { useInboxAction } from "./use-inbox-action";

const KIND: Record<PageKind, string> = {
  pl: "P&L",
  bs: "Balance sheet",
  cf: "Cash flow",
  notes: "Notes",
  segment: "Segments",
  mdna: "Management discussion",
  other: "Other",
};

/** "P&L · consolidated": what the page is, and on which basis the document prints it. */
export function pageLabel(page: Pick<InboxDoc["pages"][number], "kind" | "basis">): string {
  const kind = page.kind ? KIND[page.kind] : "Not a statement page";
  return page.basis ? `${kind} · ${page.basis}` : kind;
}

function raisePrompt(pagesLeft: number, aiOn: boolean): string {
  const ask = `Raise this document to ${MAX_PAGE_BUDGET} pages?`;
  if (!aiOn) return ask;
  const now = new Date();
  const eta = estimateReadyBy({ pagesLeft, tokensPerPage: TOKENS_PER_PAGE_DEFAULT, usedToday: 0, caps: { tpm: GROQ_CAPS.tpm, tpd: GROQ_CAPS.tpd }, now, tabOpen: true });
  const when = formatReadyBy(eta, now);
  return `${ask} ${when[0].toUpperCase()}${when.slice(1)}.`;
}

type Props = { doc: InboxDoc; aiOn: boolean; /** Pages still to read, so the prompt can say when the extra page would be done. */ pagesLeft: number; actions: InboxActions };

/** Statement pages and ticked pages of one document. Ticking past its page budget asks to raise the budget first. */
export function PageChooser({ doc, aiOn, pagesLeft, actions }: Props) {
  const { pending, error, run } = useInboxAction();
  const [raiseFor, setRaiseFor] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  // The tick shows at once and settles (or springs back, on a refusal) when the server answers.
  const [pages, showTick] = useOptimistic(doc.pages, (all, change: { pageNo: number; selected: boolean }) =>
    all.map((p) => (p.pageNo === change.pageNo ? { ...p, selected: change.selected } : p)),
  );
  const ticked = pages.filter((p) => p.selected).length;

  function toggle(pageNo: number, selected: boolean) {
    setFull(false);
    if (selected && ticked >= doc.budget) {
      if (doc.budget >= MAX_PAGE_BUDGET) setFull(true);
      else setRaiseFor(pageNo);
      return;
    }
    setRaiseFor(null);
    void run(() => {
      showTick({ pageNo, selected });
      return actions.setPageSelected(doc.id, pageNo, selected);
    });
  }

  async function raiseAndTick(pageNo: number) {
    await run(async () => {
      showTick({ pageNo, selected: true });
      const raised = await setBudgetAction(doc.id, MAX_PAGE_BUDGET);
      return raised.ok ? actions.setPageSelected(doc.id, pageNo, true) : raised;
    });
    setRaiseFor(null);
  }

  return (
    <details className="rounded-sm border border-rule">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-small text-ink">
        <span className="font-semibold">Pages to read</span>
        <span className="tabular-nums text-ink-muted">
          {ticked} of {doc.budget} allowed
        </span>
      </summary>
      <ul className="divide-y divide-rule border-t border-rule">
        {pages.map((page) => (
          <li key={page.pageNo}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-ink"
                checked={page.selected}
                disabled={pending}
                aria-labelledby={`${doc.id}-p${page.pageNo}`}
                onChange={(e) => toggle(page.pageNo, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span id={`${doc.id}-p${page.pageNo}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-mono-id text-ink-muted">p. {page.pageNo}</span> <span className="text-small font-semibold text-ink">{pageLabel(page)}</span>
                </span>
                {page.firstLine ? <span className="block truncate text-caption text-ink-muted">{page.firstLine}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {raiseFor !== null ? (
        <div role="group" aria-label="Raise the page limit" className="space-y-2 border-t border-rule bg-surface p-3">
          <p className="text-small text-ink">{raisePrompt(pagesLeft + 1, aiOn)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => void raiseAndTick(raiseFor)}>
              Raise to {MAX_PAGE_BUDGET} and tick page {raiseFor}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRaiseFor(null)}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}
      {full ? (
        <p role="alert" className="border-t border-rule p-3 text-small text-ink">
          This document is at {MAX_PAGE_BUDGET} pages, the most the AI reads. Untick a page first.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-t border-rule p-3 text-small text-bad">
          {error}
        </p>
      ) : null}
    </details>
  );
}
