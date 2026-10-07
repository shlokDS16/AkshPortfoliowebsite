"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EDIT_EVENT } from "./edit-event";
import { FactsEditor } from "./facts-form/facts-editor";
import { useFactsState } from "./facts-form/use-facts-state";

type Props = { action: (formData: FormData) => Promise<void>; bodyMd: string; sheet: string | null; isPublic?: boolean; figuresTo?: string | null };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Aksh's words and the facts are separate fields (CLAUDE.md); the facts (form or text sheet) are checked with the casefile schema's own rules as he types. */
export function RevisionEditor({ action, bodyMd, sheet, isPublic = false, figuresTo = null }: Props) {
  const body = useRef<HTMLTextAreaElement>(null);
  const [bodyText, setBodyText] = useState(bodyMd);
  const facts = useFactsState(sheet ?? "", bodyText);
  // Rule 4: a save that would break a body citation needs a second press, once per set of broken ids.
  const [confirmFor, setConfirmFor] = useState("");
  const brokenKey = facts.broken.join(",");
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (sheet === null || brokenKey === "" || confirmFor === brokenKey) return;
    event.preventDefault();
    setConfirmFor(brokenKey);
  }
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
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-title text-ink desk:text-title-desk">New revision</h2>
      {isPublic ? (
        <p className="text-small text-ink-muted">This item is public. A new revision is stored at once but stays hidden until it passes the publishing gate.</p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="bodyMd">Body (Markdown)</Label>
        <Textarea ref={body} id="bodyMd" name="bodyMd" defaultValue={bodyMd} onChange={(e) => setBodyText(e.target.value)} rows={14} />
        <p className="text-caption text-ink-muted">
          Your words. For a company file: the view, then &quot;## What would prove me wrong&quot; with one &quot;- T1: …&quot; line per test. Cite a fact with [F1].
        </p>
      </div>
      {sheet !== null ? <FactsEditor facts={facts} bodyMd={bodyText} figuresTo={figuresTo} /> : null}
      {facts.broken.length > 0 && sheet !== null ? (
        <p role="alert" className="rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">
          The body cites {facts.broken.map((id) => `[${id}]`).join(", ")}, which {facts.broken.length === 1 ? "is" : "are"} no longer in the facts. Those citations will
          break. Add the fact back or change the body.{confirmFor === brokenKey ? " Press Save revision again to save anyway." : ""}
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="changeReason">Change reason</Label>
        <Input id="changeReason" name="changeReason" placeholder="What changed and why" />
      </div>
      <Button type="submit" disabled={sheet !== null && facts.blocking}>
        Save revision
      </Button>
    </form>
  );
}
