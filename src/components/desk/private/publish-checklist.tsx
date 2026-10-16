"use client";

import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { addDays, isPastLag, PUBLICATION_LAG_DAYS } from "@/lib/dates";
import { formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/modules/compliance/client";
import { ConceptCheckRow, type ConceptCheck } from "./concepts/concept-check-row";
import { PublishBar } from "./publish-bar";

export type { ConceptCheck };

type Props = {
  items: ChecklistItem[];
  rule4Needed: boolean;
  companyName: string | null;
  companyAction: ((formData: FormData) => Promise<void>) | null;
  /** Linked concepts that are not public (Phase 4): one line each after the company line, each a failure the gate would record. */
  concepts?: ConceptCheck[];
  publishAction: ((formData: FormData) => Promise<void>) | null;
  publishLabel: string;
  /** `today` is the India date from the server; `dataAsOf` the item's Figures to (null: no lag applies, as in SQL is_lagged). */
  live: { revNo: number; unpublish: (formData: FormData) => Promise<void>; dataAsOf: string | null; today: string } | null;
  /** Company files carry exhibits whose titles and summaries no check can read for figures (carried from Task 7). */
  figureReminder?: boolean;
};

const GLYPH = { pass: Check, fail: TriangleAlert, manual: CircleDashed } as const;
const SEGMENT = { pass: "bg-ink", fail: "bg-bad", manual: "hatch bg-warn-wash" } as const;

/** C's checklist as the summary of B's notes. The only publish path is the database gate; no override exists. */
export function PublishChecklist({ items, rule4Needed, companyName, companyAction, concepts = [], publishAction, publishLabel, live, figureReminder = true }: Props) {
  const [ticked, setTicked] = useState(false);
  // The hand tick counts, and shows as passed, ONLY while the rule 4 row is waiting for it (manual). When the ledger refuses
  // (a recent entry, or a failed ledger check) the row stays a failure whatever the box says, and the box is not offered: the
  // sentence beside it would be false. The server applies the same rule (publishCheckedAction).
  const rule4Row = items.find((i) => i.id === "rule-4");
  const tickable = rule4Needed && (rule4Row === undefined || rule4Row.state === "manual");
  const rule4 = tickable && ticked;
  const honoured = (i: ChecklistItem) => i.id === "rule-4" && i.state === "manual" && rule4;
  const passed = items.filter((i) => i.state === "pass" || honoured(i)).length;
  const total = items.length + concepts.length;
  const failing = items.filter((i) => i.state === "fail").length + concepts.length;
  const hasCompanyRow = items.some((i) => i.id === "company");
  const reason = [failing ? `${formatCount(failing, "rule")} ${failing === 1 ? "fails" : "fail"}` : null, tickable && !rule4 ? "rule 4 unchecked" : null]
    .filter(Boolean)
    .join(" · ");
  const summary = reason
    ? `Preview: ${reason}. The gate decides and records the result; you can run it now.`
    : "Preview passes. The gate decides and records the result.";
  return (
    <section aria-label="Publish checklist" className="space-y-3">
      {total > 0 ? (
        <>
          <h2 className="text-subtitle text-ink">
            Publish checklist · {passed} of {total}
          </h2>
          <div aria-hidden className="flex h-1.5 gap-0.5">
            {items.map((i) => (
              <span key={i.id} className={cn("flex-1 transition-colors duration-(--motion-fast)", honoured(i) ? SEGMENT.pass : SEGMENT[i.state])} />
            ))}
            {concepts.map((c) => (
              <span key={c.id} className={cn("flex-1", SEGMENT.fail)} />
            ))}
          </div>
        </>
      ) : null}
      <ul className="divide-y divide-rule">
        {items.map((i) => {
          const done = honoured(i);
          const Glyph = GLYPH[done ? "pass" : i.state];
          return (
            <Fragment key={i.id}>
              <li className={cn("flex gap-2 py-2", i.state === "fail" && "bg-bad-wash px-2")}>
                <Glyph aria-hidden strokeWidth={1.5} className={cn("mt-0.5 size-4 shrink-0", i.state === "fail" ? "text-bad" : i.state === "manual" && !done ? "text-warn" : "text-ink")} />
                <div className="min-w-0 text-small">
                  <p className="font-semibold text-ink">{i.name}</p>
                  <p className="text-ink-muted">{i.detail}</p>
                  {i.id === "company" && i.state === "fail" && companyAction ? (
                    <form action={companyAction} className="mt-1">
                      <Button type="submit" variant="outline" size="sm" className="h-auto min-h-8 py-1.5 whitespace-normal text-left pointer-coarse:h-auto pointer-coarse:min-h-11">
                        Make {companyName} public
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
              {i.id === "company" ? concepts.map((c) => <ConceptCheckRow key={c.id} concept={c} />) : null}
            </Fragment>
          );
        })}
        {hasCompanyRow ? null : concepts.map((c) => <ConceptCheckRow key={c.id} concept={c} />)}
      </ul>
      {figureReminder ? (
        <p className="text-caption text-ink-muted">
          Before you run the gate: exhibit titles and summaries are your own words and no check can read them for figures. Do not quote a figure younger than 30 days there.
        </p>
      ) : null}
      {publishAction ? (
        <PublishBar
          action={publishAction}
          label={publishLabel}
          summary={summary}
          rule4={tickable ? { company: companyName ?? "this company", checked: rule4, onChange: setTicked } : null}
        />
      ) : !live ? (
        <p className="text-small text-ink-muted">Save a revision to publish it.</p>
      ) : null}
      {live ? (
        <form action={live.unpublish} className="flex items-center justify-between gap-2 border-t border-rule pt-3 text-small">
          <span>
            {live.dataAsOf && !isPastLag(live.dataAsOf, live.today)
              ? `Passed the gate. Shows on the public site from ${formatDate(addDays(live.dataAsOf, PUBLICATION_LAG_DAYS))} (30-day lag)`
              : `Live: revision #${live.revNo}`}
          </span>
          <Button type="submit" variant="outline" size="sm">
            Unpublish
          </Button>
        </form>
      ) : null}
    </section>
  );
}
