"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseFactsSheet } from "@/modules/casefile/client";
import type { ActionResult, FactProvenance, StagedRow } from "@/modules/ingestion/client";
import { EDIT_EVENT } from "./edit-event";
import { usePublishFacts } from "./doc-pane/workspace";
import { FactsEditor } from "./facts-form/facts-editor";
import { CitationWarning } from "./facts-form/citation-warning";
import { buildMarks } from "./facts-form/marks";
import { StagedBanner } from "./facts-form/staged-banner";
import { useFactsState } from "./facts-form/use-facts-state";

type Props = {
  action: (formData: FormData) => Promise<void>;
  bodyMd: string;
  sheet: string | null;
  isPublic?: boolean;
  figuresTo?: string | null;
  /** Machine-read figures Aksh has accepted for this file, merged into the Facts form as new rows. */
  staged?: StagedRow[];
  /** Where each saved fact was read, by fact id. */
  provenance?: Record<string, FactProvenance>;
  /** Send a document's staged figures back to its review screen. */
  sendBack?: (documentId: string) => Promise<ActionResult>;
};

const NO_STAGED: StagedRow[] = [];
const NO_PROVENANCE: Record<string, FactProvenance> = {};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Aksh's words and the facts are separate fields (CLAUDE.md); the facts (form or text sheet) are checked with the casefile schema's own rules as he types. */
export function RevisionEditor({ action, bodyMd, sheet, isPublic = false, figuresTo = null, staged = NO_STAGED, provenance = NO_PROVENANCE, sendBack }: Props) {
  const body = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [bodyText, setBodyText] = useState(bodyMd);
  const facts = useFactsState(sheet ?? "", bodyText, sheet === null ? [] : staged, Object.keys(provenance));
  const marks = useMemo(() => {
    const saved = sheet === null ? null : parseFactsSheet(sheet);
    return buildMarks(facts.staging.pairs, staged, saved && saved.errors.length === 0 ? saved.caseFile : null, provenance);
  }, [facts.staging.pairs, staged, sheet, provenance]);
  usePublishFacts(facts.checkable); // the document pane checks these quoted lines
  // Rule 4: a save that newly breaks a body citation needs a second press, once per set of newly broken ids.
  // Citations already broken when the editor opened are shown as a warning only.
  const [brokenAtLoad] = useState(() => facts.broken);
  const fresh = facts.broken.filter((id) => !brokenAtLoad.includes(id));
  const old = facts.broken.filter((id) => brokenAtLoad.includes(id));
  const [confirmFor, setConfirmFor] = useState("");
  const brokenKey = fresh.join(",");
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (sheet === null || brokenKey === "" || confirmFor === brokenKey) return;
    event.preventDefault();
    setConfirmFor(brokenKey);
  }
  useEffect(() => {
    // React 19 resets a <form action> once the action settles, and a failed save redirects back to this same editor.
    // The reset would put controlled selects back on their first option and clear the change reason, so it is
    // cancelled: typed input is never lost (rule 7). A successful save remounts the editor (keyed by the newest revision).
    // A native listener, because React runs the reset during commit, when its own event handlers are switched off.
    const el = form.current;
    const keep = (event: Event) => event.preventDefault();
    el?.addEventListener("reset", keep);
    return () => el?.removeEventListener("reset", keep);
  }, []);
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
    <form action={action} onSubmit={onSubmit} ref={form} className="space-y-4">
      <h2 className="text-title text-ink desk:text-title-desk">New revision</h2>
      {isPublic ? (
        <p className="text-small text-ink-muted">
          This item is public. A new revision is stored at once but stays hidden until it passes the publishing gate.
          {sheet !== null
            ? " Figures to cannot move forward while this file is public. To use newer figures, unpublish it: the file goes offline until its new figures are 30 days old."
            : null}
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="bodyMd">Body (Markdown)</Label>
        <Textarea ref={body} id="bodyMd" name="bodyMd" value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={14} />
        <p className="text-caption text-ink-muted">
          Your words. For a company file: the view, then &quot;## What would prove me wrong&quot; with one &quot;- T1: …&quot; line per test. Cite a fact with [F1].
        </p>
      </div>
      {sheet !== null && staged.length > 0 ? (
        <StagedBanner staged={staged} mergedIds={facts.staging.mergedIds} presentIds={facts.staging.pairs.map((p) => p.proposalId)} unseen={facts.staging.unseen} sendBack={sendBack} />
      ) : null}
      {facts.staging.field ? <input type="hidden" name="provenance" value={facts.staging.field} /> : null}
      {sheet !== null ? <FactsEditor facts={facts} bodyMd={bodyText} figuresTo={figuresTo} marks={marks} /> : null}
      {sheet !== null ? <CitationWarning fresh={fresh} old={old} confirming={brokenKey !== "" && confirmFor === brokenKey} /> : null}
      <div className="space-y-1">
        <Label htmlFor="changeReason">Change reason</Label>
        <Input id="changeReason" name="changeReason" placeholder="What changed and why (for example: added FY26 figures from the annual report)" />
      </div>
      <Button type="submit" disabled={sheet !== null && facts.blocking}>
        Save revision
      </Button>
    </form>
  );
}
