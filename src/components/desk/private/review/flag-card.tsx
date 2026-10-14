"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText } from "@/lib/messages";
import { resolveFlagAction } from "@/modules/ingestion/actions";
import type { EditFields, ProposalView } from "@/modules/ingestion/client";
import { Marked, pageLine, wordsOf } from "./page-text";

const UNITS = ["₹ cr", "₹ lakh", "₹ mn", "%"];
const choice = "flex min-h-11 w-full items-center gap-3 rounded-sm border border-rule-strong bg-paper px-3 text-left text-body font-medium text-ink transition-[background-color,transform] duration-(--motion-fast) ease-snap hover:bg-surface-2 active:scale-(--press-scale) disabled:opacity-45";
const numeral = "inline-flex size-6 shrink-0 items-center justify-center rounded-xs border border-b-2 border-rule-strong font-mono text-mono-label text-ink-muted";

type Props = { documentId: string; flag: ProposalView; n: number; total: number; pageText: string | undefined; onResolved(view: ProposalView): void };

/** One flagged figure (segment 4 C): what the desk read, why it is not trusted, the line on the page, and two numbered choices. */
export function FlagCard({ documentId, flag, n, total, pageText, onResolved }: Props) {
  const id = useId();
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLElement>(null);
  const line = pageText ? pageLine(pageText, flag.label) : null;
  const needsPeriod = flag.flags.includes("period_unknown") || flag.period === "";
  const needsUnit = flag.flags.includes("unit_unknown") || flag.unit === "";

  async function send(input: Parameters<typeof resolveFlagAction>[2]) {
    setBusy(true);
    setError(null);
    try {
      const result = await resolveFlagAction(documentId, flag.id, input);
      if (result.ok) onResolved(result.view);
      else setError(result.message);
    } catch {
      setError(errorText("save-failed"));
    }
    setBusy(false);
  }
  const drop = () => void send({ kind: "reject" });

  // Keys 1 and 2 answer the card only while focus is inside it (WCAG 2.1.4), and never while Aksh types in a field.
  function onKey(e: KeyboardEvent<HTMLElement>) {
    const t = e.target as HTMLElement;
    if (busy || e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, select")) return;
    if (e.key !== "1" && e.key !== "2") return;
    e.preventDefault(); // the key answers the card; it must not also be typed into the field it opens
    if (e.key === "1") setTyping(true);
    else drop();
  }
  // Each new card takes focus, so the keys work at once and a screen reader hears "Check 2 of 3".
  useEffect(() => card.current?.focus(), [n]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    const fields: EditFields = { valueText: get("value") };
    for (const [key, name] of [["unit", "unit"], ["period", "period"], ["priorValueText", "prior"]] as const) if (get(name) !== "") fields[key] = get(name);
    void send({ kind: "edit", fields });
  }

  return (
    <section ref={card} tabIndex={-1} onKeyDown={onKey} aria-label={`Check ${n} of ${total}`} className="space-y-4 outline-none rounded-sm border border-l-4 border-rule border-l-bad bg-paper p-4">
      <p className="font-mono text-mono-label uppercase text-bad">
        Check {n} of {total}
      </p>
      <div>
        <h2 className="text-subtitle text-ink">
          {flag.label}
        </h2>
        <p className="mt-0.5 text-small text-ink-muted">
          p. {flag.page}
          {flag.period ? ` · ${flag.period}` : ""}
          {flag.unit ? ` · ${flag.unit}` : ""}
        </p>
      </div>
      <p className="text-body text-ink-body">
        The desk read{" "}
        <s className="font-mono text-ink tabular-nums">{flag.machineText}</s>
        <span className="sr-only">, struck through</span>
      </p>
      <ul className="space-y-1 text-body text-ink">
        {flag.why.map((why) => (
          <li key={why}>{why}</li>
        ))}
      </ul>
      <div>
        <p className="font-mono text-mono-label uppercase text-ink-muted">The page line</p>
        {line ? (
          <p className="mt-1 break-words rounded-xs bg-surface px-2 py-1.5 font-mono text-data text-ink-body tabular-nums">
            <Marked text={line} words={wordsOf(flag.label)} />
          </p>
        ) : (
          <p className="mt-1 text-small text-ink-muted">No line with this label was found on p. {flag.page}.</p>
        )}
      </div>

      <div className="space-y-2">
        <button type="button" className={choice} disabled={busy} aria-expanded={typing} onClick={() => setTyping(true)}>
          <span className={numeral}>1</span> Type the value from the page
        </button>
        <button type="button" className={choice} disabled={busy} onClick={drop}>
          <span className={numeral}>2</span> Drop it
        </button>
      </div>

      {typing ? (
        <form onSubmit={submit} className="space-y-3 border-t border-rule pt-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-value`}>Value as printed on the page</Label>
            <Input id={`${id}-value`} name="value" required autoFocus autoComplete="off" inputMode="decimal" className="font-mono tabular-nums" />
          </div>
          {needsPeriod ? (
            <div className="space-y-1">
              <Label htmlFor={`${id}-period`}>Year, for example FY26</Label>
              <Input id={`${id}-period`} name="period" required autoComplete="off" defaultValue={flag.period} placeholder="FY26" />
            </div>
          ) : null}
          {needsUnit ? (
            <div className="space-y-1">
              <Label htmlFor={`${id}-unit`}>Unit</Label>
              <select id={`${id}-unit`} name="unit" required defaultValue={flag.unit} className="min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink">
                <option value="">Choose</option>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          ) : null}
          {flag.flags.includes("prior_not_on_page") && flag.prior ? (
            <div className="space-y-1">
              <Label htmlFor={`${id}-prior`}>Prior-year figure as printed</Label>
              <Input id={`${id}-prior`} name="prior" required autoComplete="off" inputMode="decimal" defaultValue={flag.prior} className="font-mono tabular-nums" />
            </div>
          ) : null}
          <Button type="submit" disabled={busy}>
            Save value
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}
