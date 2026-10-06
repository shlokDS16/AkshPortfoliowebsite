"use client";

import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/modules/compliance/client";
import { PublishBar } from "./publish-bar";

type Props = {
  items: ChecklistItem[];
  rule4Needed: boolean;
  companyName: string | null;
  companyAction: ((formData: FormData) => Promise<void>) | null;
  publishAction: ((formData: FormData) => Promise<void>) | null;
  publishLabel: string;
  live: { revNo: number; unpublish: (formData: FormData) => Promise<void> } | null;
  /** Company files carry exhibits whose titles and summaries no check can read for figures (carried from Task 7). */
  figureReminder?: boolean;
};

const GLYPH = { pass: Check, fail: TriangleAlert, manual: CircleDashed } as const;
const SEGMENT = { pass: "bg-ink", fail: "bg-bad", manual: "hatch bg-warn-wash" } as const;

/** C's checklist as the summary of B's notes. The only publish path is the database gate; no override exists. */
export function PublishChecklist({ items, rule4Needed, companyName, companyAction, publishAction, publishLabel, live, figureReminder = true }: Props) {
  const [rule4, setRule4] = useState(false);
  const passed = items.filter((i) => i.state === "pass" || (i.id === "rule-4" && rule4)).length;
  const failing = items.filter((i) => i.state === "fail").length;
  const reason = [failing ? `${formatCount(failing, "rule")} ${failing === 1 ? "fails" : "fail"}` : null, rule4Needed && !rule4 ? "rule 4 unchecked" : null]
    .filter(Boolean)
    .join(" · ");
  const summary = reason
    ? `Preview: ${reason}. The gate decides and records the result; you can run it now.`
    : "Preview passes. The gate decides and records the result.";
  return (
    <section aria-labelledby="checklist-head" className="space-y-3">
      <h2 id="checklist-head" className="text-subtitle text-ink">
        Publish checklist · {passed} of {items.length}
      </h2>
      <div aria-hidden className="flex h-1.5 gap-0.5">
        {items.map((i) => (
          <span key={i.id} className={cn("flex-1 transition-colors duration-(--motion-fast)", i.id === "rule-4" && rule4 ? SEGMENT.pass : SEGMENT[i.state])} />
        ))}
      </div>
      <ul className="divide-y divide-rule">
        {items.map((i) => {
          const done = i.id === "rule-4" && rule4;
          const Glyph = GLYPH[done ? "pass" : i.state];
          return (
            <li key={i.id} className={cn("flex gap-2 py-2", i.state === "fail" && "bg-bad-wash px-2")}>
              <Glyph aria-hidden strokeWidth={1.5} className={cn("mt-0.5 size-4 shrink-0", i.state === "fail" ? "text-bad" : i.state === "manual" && !done ? "text-warn" : "text-ink")} />
              <div className="text-small">
                <p className="font-semibold text-ink">{i.name}</p>
                <p className="text-ink-muted">{i.detail}</p>
                {i.id === "company" && i.state === "fail" && companyAction ? (
                  <form action={companyAction} className="mt-1">
                    <Button type="submit" variant="outline" size="sm">
                      Make {companyName} public
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
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
          rule4={rule4Needed && companyName ? { company: companyName, checked: rule4, onChange: setRule4 } : null}
        />
      ) : !live ? (
        <p className="text-small text-ink-muted">Save a revision to publish it.</p>
      ) : null}
      {live ? (
        <form action={live.unpublish} className="flex items-center justify-between gap-2 border-t border-rule pt-3 text-small">
          <span>Live: revision #{live.revNo}</span>
          <Button type="submit" variant="outline" size="sm">
            Unpublish
          </Button>
        </form>
      ) : null}
    </section>
  );
}
