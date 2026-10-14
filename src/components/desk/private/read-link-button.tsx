"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startLinkAction } from "@/modules/ingestion/actions";
import { hostOf } from "./first-link";

type Outcome = { ok: true; documentId: string } | { ok: false; text: string };

/**
 * "Read this link" beside a capture that holds a link (Plan 2b Task 5). Aksh's own click, never automatic: the desk opens the
 * link on the server only when this is pressed, so a capture never costs a fetch or a model call by itself.
 */
export function ReadLinkButton({ url, companyId }: { url: string; companyId: string | null }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, start] = useTransition();

  function read() {
    setOutcome(null);
    start(async () => {
      const result = await startLinkAction({ url, companyId, filedOn: null }).catch(() => null);
      if (!result) return setOutcome({ ok: false, text: "The desk could not open that link. Try again." });
      setOutcome(result.ok ? { ok: true, documentId: result.documentId } : { ok: false, text: result.message });
    });
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3">
      <Button type="button" variant="link" size="sm" onClick={read} disabled={pending || outcome?.ok === true} aria-label={`Read this link, ${hostOf(url)}`}>
        {pending ? "Opening the link…" : "Read this link"}
      </Button>
      {outcome?.ok ? (
        <span role="status" className="text-small text-ink-muted">
          Added to your inbox.{" "}
          <Link href={`/desk/inbox#doc-${outcome.documentId}`} className="text-geru underline underline-offset-3">
            Open the inbox
          </Link>
        </span>
      ) : null}
      {outcome && !outcome.ok ? (
        <span role="alert" className="text-small text-bad">
          {outcome.text}
        </span>
      ) : null}
    </span>
  );
}
