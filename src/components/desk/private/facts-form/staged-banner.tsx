"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/messages";
import { formatCount } from "@/lib/format";
import { CASEFILE_LIMITS } from "@/modules/casefile/client";
import type { ActionResult, StagedRow } from "@/modules/ingestion/client";

type Props = {
  staged: StagedRow[];
  /** Staged figures the form opened with, and the ones still in it. */
  mergedIds: string[];
  presentIds: string[];
  /** Staged figures that could not be shown because the text sheet does not parse. */
  unseen: number;
  sendBack?: (documentId: string) => Promise<ActionResult>;
};

/** Says how many machine-read figures wait in the form, and lets Aksh send a document's figures back to its review screen. */
export function StagedBanner({ staged, mergedIds, presentIds, unseen, sendBack }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const merged = new Set(mergedIds);
  const present = new Set(presentIds);
  const docs = [...new Map(staged.map((s) => [s.document.id, s.document.title])).entries()];
  if (docs.length === 0) return null;

  async function back(documentId: string) {
    if (!sendBack) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendBack(documentId);
      if (!result.ok) return setError(result.message);
      router.push(`/desk/inbox/${documentId}/review`);
    } catch {
      setError(errorText("save-failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Staged figures" data-testid="staged-banner" className="space-y-3 rounded-sm border border-rule bg-surface px-3 py-3 text-small text-ink">
      {docs.map(([id, title]) => {
        const mine = staged.filter((s) => s.document.id === id);
        const shown = mine.filter((s) => present.has(s.proposalId)).length;
        const left = mine.filter((s) => !merged.has(s.proposalId)).length;
        const hidden = unseen > 0 ? mine.length : 0;
        return (
          <div key={id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {hidden > 0 ? (
                <p>Fix the text sheet to see the {formatCount(hidden, "staged figure")} from {title}.</p>
              ) : (
                <>
                  {shown > 0 ? (
                    <p>
                      {formatCount(shown, "figure")} from {title} {shown === 1 ? "is" : "are"} staged below. Check them, write your change reason and save.
                    </p>
                  ) : mine.length > left ? (
                    <p>You removed every staged figure from {title}. Saving sends them back to the review list.</p>
                  ) : null}
                  {left > 0 ? (
                    <p className="text-ink-muted">
                      {formatCount(left, "more figure")} from {title} {left === 1 ? "is" : "are"} not shown: already in this file, or over the {CASEFILE_LIMITS.facts}-fact limit.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {sendBack ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => back(id)} aria-label={docs.length > 1 ? `Send back to review, ${title}` : undefined}>
                Send back to review
              </Button>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p role="alert" className="text-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}
