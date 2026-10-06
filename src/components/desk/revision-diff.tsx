"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { formatDate } from "@/lib/format";
import type { RevisionDiffData } from "@/lib/view-types";

/** Phone-readable prose diff (B+): reason first, removed muted on a dashed rule (no strike-through), added on --ins. */
export function RevisionDiff({ data }: { data: RevisionDiffData | null }) {
  const [mode, setMode] = useState("changes");
  if (!data) return <p className="text-small text-ink-muted">First version. Later revisions will show what changed and why.</p>;
  const items = [
    { value: "changes", label: "Changes" },
    { value: String(data.to.revNo), label: `R${data.to.revNo}` },
    { value: String(data.from.revNo), label: `R${data.from.revNo}` },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small tabular-nums text-ink-muted">
          R{data.from.revNo} ({formatDate(data.from.on)}) to R{data.to.revNo} ({formatDate(data.to.on)})
        </p>
        <SegmentedControl size="sm" aria-label="Show" value={mode} onValueChange={setMode} items={items} />
      </div>
      <div data-diff-body className="text-read text-ink-body desk:text-read-desk">
        {mode === "changes" ? (
          <>
            <p className="mt-3">
              <span className="mr-2 text-label uppercase text-ink-muted">Reason</span>
              {data.reason}
            </p>
            {data.groups.map((g) => (
              <section key={g.location} className="mt-4">
                <h3 className="text-label uppercase text-ink-muted">{g.location}</h3>
                {g.removed.length > 0 ? (
                  <div data-diff="removed" className="mt-1 border-l-2 border-dashed border-rule-strong pl-3 text-ink-muted">
                    <p className="text-caption">Removed</p>
                    {g.removed.map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                  </div>
                ) : null}
                {g.added.length > 0 ? (
                  <div data-diff="added" className="mt-1 border-l-2 border-ink bg-ins pl-3">
                    <p className="text-caption text-ink-muted">Added</p>
                    {g.added.map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </>
        ) : (
          <div className="prose-read mt-3">
            {(data.fullText[Number(mode)] ?? []).map((p, i) => (
              <p key={i} className="my-(--para)">
                {p}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
