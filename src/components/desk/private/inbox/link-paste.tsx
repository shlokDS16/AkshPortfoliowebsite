"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { startLinkAction, startTextAction } from "@/modules/ingestion/actions";

/** What the drop bar's optional fields give a pasted link or text, checked by the drop bar. */
export type PasteExtras = { companyId: string | null; filedOn: string | null; sourceUrl: string | null };

type Notice = { tone: "ok" | "bad"; text: string; earlier?: { id: string; createdAt: string } };

/** A paste that is one http(s) address and nothing else is a link; anything else is text. The server checks the link again. */
export const looksLikeLink = (paste: string): boolean => /^https?:\/\/\S+$/i.test(paste.trim());

/**
 * Paste a link or some text (spec s6.2, Plan 2b Task 5). A link is opened by the desk on the server, once, when Aksh presses
 * Read it; nothing is fetched on its own. Text is kept as pasted. Both start reading like an upload does.
 */
export function LinkPaste({ extras, kick, disabled }: { extras: () => PasteExtras | string; kick: () => Promise<void>; disabled: boolean }) {
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, start] = useTransition();
  const link = looksLikeLink(paste);

  function read() {
    const fields = extras();
    if (typeof fields === "string") return setNotice({ tone: "bad", text: fields });
    setNotice(null);
    start(async () => {
      const result = await (link
        ? startLinkAction({ url: paste.trim(), companyId: fields.companyId, filedOn: fields.filedOn })
        : startTextAction({ text: paste, title: null, companyId: fields.companyId, filedOn: fields.filedOn, sourceUrl: fields.sourceUrl })
      ).catch(() => null);
      if (!result) return setNotice({ tone: "bad", text: "The desk could not read that. Try again." });
      if (!result.ok) return setNotice({ tone: "bad", text: result.message, earlier: result.earlier });
      setPaste("");
      setNotice({ tone: "ok", text: link ? "Opened the link. The desk starts reading it now." : "Added. The desk starts reading it now." });
      await kick().catch(() => undefined); // the 15-minute pump reads it anyway
    });
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="paste-box">Or paste a link or some text</Label>
        <Textarea
          id="paste-box"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          disabled={disabled || pending}
          placeholder="https://… or paste a results table"
          spellCheck={false}
          className="min-h-20"
        />
        <p className="text-small text-ink-muted">The desk opens a link only when you press Read it.</p>
      </div>
      <Button type="button" onClick={read} disabled={disabled || pending || paste.trim() === ""}>
        {pending ? (link ? "Opening the link…" : "Saving…") : "Read it"}
      </Button>
      <div role="status" className="min-h-5 text-small text-ink-muted">
        {notice?.tone === "ok" ? notice.text : null}
      </div>
      {notice?.tone === "bad" ? (
        <p role="alert" className="text-small text-bad">
          {notice.earlier ? `You added this on ${formatDate(notice.earlier.createdAt)}. ` : `${notice.text} `}
          {notice.earlier ? (
            <Link href={`/desk/inbox#doc-${notice.earlier.id}`} className="text-geru underline underline-offset-3">
              Open it
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
