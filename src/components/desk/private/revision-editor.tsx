"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseFactsSheet } from "@/modules/casefile/client";
import { EDIT_EVENT } from "./edit-event";

type Props = { action: (formData: FormData) => Promise<void>; bodyMd: string; sheet: string | null; isPublic?: boolean };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Aksh's words and the facts sheet are separate fields (CLAUDE.md); the sheet is checked line by line, with the casefile schema's own rules, as he types. */
export function RevisionEditor({ action, bodyMd, sheet, isPublic = false }: Props) {
  const body = useRef<HTMLTextAreaElement>(null);
  const [sheetText, setSheetText] = useState(sheet ?? "");
  const errors = useMemo(() => (sheet === null ? [] : parseFactsSheet(sheetText).errors), [sheet, sheetText]);
  useEffect(() => {
    const onEdit = (event: Event) => {
      const sentence = String((event as CustomEvent<string>).detail ?? "");
      const el = body.current;
      if (!el || !sentence) return;
      // The preview folds soft line wraps into single spaces; find the sentence however the body wraps it.
      const found = new RegExp(sentence.trim().split(/\s+/).map(escapeRe).join("\\s+")).exec(el.value);
      el.focus();
      if (found) el.setSelectionRange(found.index, found.index + found[0].length);
      el.scrollIntoView?.({ block: "center" });
    };
    window.addEventListener(EDIT_EVENT, onEdit);
    return () => window.removeEventListener(EDIT_EVENT, onEdit);
  }, []);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-title text-ink desk:text-title-desk">New revision</h2>
      {isPublic ? (
        <p className="text-small text-ink-muted">This item is public. A new revision is stored at once but stays hidden until it passes the publishing gate.</p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="bodyMd">Body (Markdown)</Label>
        <Textarea ref={body} id="bodyMd" name="bodyMd" defaultValue={bodyMd} rows={14} />
        <p className="text-caption text-ink-muted">
          Your words. For a company file: the view, then &quot;## What would prove me wrong&quot; with one &quot;- T1: …&quot; line per test. Cite a fact with [F1].
        </p>
      </div>
      {sheet !== null ? (
        <div className="space-y-1">
          <Label htmlFor="factsSheet">Facts sheet</Label>
          <Textarea
            id="factsSheet"
            name="factsSheet"
            value={sheetText}
            onChange={(e) => setSheetText(e.target.value)}
            rows={12}
            spellCheck={false}
            aria-invalid={errors.length > 0 ? true : undefined}
            aria-describedby="sheet-help sheet-errors"
            className="font-mono text-small"
          />
          <p id="sheet-help" className="text-caption text-ink-muted">
            The facts, one row each, typed by hand or pasted. Sources, facts, test readings, exhibits and the scenario all live here; the legend on top lists the columns.
          </p>
          <ul id="sheet-errors" aria-live="polite" className="space-y-0.5 text-small text-bad">
            {errors.map((e) => (
              <li key={`${e.line}-${e.message}`}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="changeReason">Change reason</Label>
        <Input id="changeReason" name="changeReason" placeholder="What changed and why" />
      </div>
      <Button type="submit" disabled={errors.length > 0}>
        Save revision
      </Button>
    </form>
  );
}
