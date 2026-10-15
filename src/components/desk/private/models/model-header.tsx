import { Lock } from "lucide-react";
import Link from "next/link";
import type { ModelHead } from "@/modules/valuation";
import { newerLine, reportChip, RULE9_LINE, versionLine } from "./copy";

// The model page's header (spec s7.3): the company, "Model version 3, read 14 Oct 2026 from <file title>", the report chip, and the fixed
// rule 9 line, designed as part of the page, not a footer. A newer version is pointed to. "All models" is the way to the list (it has no tab).

export function ModelHeader({ head }: { head: ModelHead }) {
  return (
    <header className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-mono-label uppercase text-ink-muted">Model</p>
          <Link href="/desk/models" className="inline-flex min-h-11 items-center text-small text-geru underline decoration-1 underline-offset-3 desk:text-small-desk">
            All models
          </Link>
        </div>
        <h1 className="text-display text-ink desk:text-display-desk">{head.company}</h1>
        <p className="text-small text-ink-muted desk:text-small-desk">{versionLine(head.versionNo, head.readAt, head.fileTitle)}</p>
      </div>
      {head.report ? (
        <p className="inline-flex rounded-sm border border-rule-strong px-2 py-1 font-mono text-mono-tag text-ink" data-testid="report-chip">
          {reportChip(head.report)}
        </p>
      ) : null}
      <p className="flex items-start gap-2 border-l-2 border-ink bg-surface px-3 py-2 text-small text-ink desk:text-small-desk">
        <Lock aria-hidden strokeWidth={1.5} className="mt-0.5 size-4 shrink-0" />
        <span>{RULE9_LINE}</span>
      </p>
      {head.newer ? (
        <p className="text-small text-ink desk:text-small-desk">
          {newerLine(head.newer.versionNo)}{" "}
          <Link href={`/desk/models/${head.newer.versionId}`} className="text-geru underline decoration-1 underline-offset-3">
            open it
          </Link>
        </p>
      ) : null}
    </header>
  );
}
