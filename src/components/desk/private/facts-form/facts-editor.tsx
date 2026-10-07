"use client";

import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { FactsForm } from "./facts-form";
import type { FactsMode, FactsState } from "./use-facts-state";

type Props = { facts: FactsState; bodyMd: string; figuresTo: string | null };

const MODES = [
  { value: "form", label: "Form" },
  { value: "text", label: "Text sheet" },
];

/** Form (default) or the pipe-delimited text sheet; both write the one factsSheet field the save action parses. */
export function FactsEditor({ facts: s, bodyMd, figuresTo }: Props) {
  const fileErrors = [...(s.rows.file ?? []), ...(s.rows.O ?? [])];
  return (
    <section aria-labelledby="facts-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="facts-heading" className="text-subtitle text-ink desk:text-subtitle-desk">
          Facts
        </h3>
        <SegmentedControl aria-label="Facts editor" size="sm" value={s.mode} onValueChange={(v) => s.switchTo(v as FactsMode)} items={MODES} />
      </div>
      {s.refusal ? (
        <div role="alert" className="space-y-1 rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {s.refusal.to === "form" ? (
            <>
              <p>The text sheet has problems, so it cannot open as a form yet. Fix these lines first; nothing has been changed:</p>
              <ul className="space-y-0.5">
                {s.refusal.errors.map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {s.fieldCount === 1 ? "One field needs" : `${s.fieldCount} fields need`} fixing before the facts can turn into the text sheet. Each is marked below;
              nothing has been changed.
            </p>
          )}
        </div>
      ) : null}
      {s.mode === "text" ? (
        <div className="space-y-1">
          <Label htmlFor="factsSheet">Facts sheet</Label>
          <Textarea
            id="factsSheet"
            name="factsSheet"
            value={s.text}
            onChange={(e) => s.setText(e.target.value)}
            rows={12}
            spellCheck={false}
            aria-invalid={s.sheetErrors.length > 0 ? true : undefined}
            aria-describedby="sheet-help sheet-errors"
            className="font-mono text-small"
          />
          <p id="sheet-help" className="text-caption text-ink-muted">
            The facts, one row each, typed by hand or pasted. Sources, facts, test readings, exhibits and the scenario all live here; the legend on top lists the columns.
          </p>
          <ul id="sheet-errors" aria-live="polite" className="space-y-0.5 text-small text-bad">
            {s.sheetErrors.map((e) => (
              <li key={`${e.line}-${e.message}`}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : s.draft ? (
        <>
          <input type="hidden" name="factsSheet" value={s.sheetText} />
          <FactsForm draft={s.draft} update={s.update} fields={s.fields} rows={s.rows} bodyMd={bodyMd} />
          <div aria-live="polite" className="space-y-1 text-small text-bad">
            {fileErrors.map((e) => (
              <p key={e}>{e}</p>
            ))}
            {s.fieldCount > 0 ? <p>{s.fieldCount === 1 ? "One field needs" : `${s.fieldCount} fields need`} fixing before you can save; each is marked above.</p> : null}
          </div>
        </>
      ) : null}
      {s.latest ? (
        <p className="rounded-sm border border-rule p-3 text-small text-ink-body tabular-nums">
          {`Latest figure date in these facts: ${formatDate(s.latest)}.`}
          {figuresTo && figuresTo >= s.latest
            ? " Figures to already covers it."
            : ` Figures to is ${figuresTo ? formatDate(figuresTo) : "not set"}; rule 3 needs that date or later. After you save, use "Set Figures to" above (or the Figures to field under Details).`}
        </p>
      ) : null}
    </section>
  );
}
