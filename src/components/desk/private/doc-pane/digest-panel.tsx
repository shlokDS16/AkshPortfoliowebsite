"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DIGEST_FACT_ADDED, DIGEST_FACT_REFUSED, DIGEST_MARKER, DIGEST_NOT_ON_PAGE, DIGEST_NOTE, digestCount, digestToggle, type DigestLine,
} from "@/modules/ingestion/client";
import { ADD_FACT_EVENT, type AddFactDetail, type AddSourceDetail } from "../add-source-event";
import { useDigest } from "./use-digest";

type Props = { documentId: string; pageNo: number; source: AddSourceDetail; onUsed?(): void };

function Claim({ line, children }: { line: DigestLine; children?: ReactNode }) {
  return (
    <li className="space-y-1 border-t border-rule pt-2 first:border-t-0 first:pt-0">
      <p className="font-mono text-mono-tag uppercase text-ink-muted">{line.section}</p>
      <p className="text-body text-ink">{line.claim}</p>
      <blockquote className="border-l-2 border-rule-strong pl-2 font-mono text-data text-ink-body">{line.line}</blockquote>
      {children}
    </li>
  );
}

/**
 * The AI's notes on one commentary page: claims management makes, each beside the line it says carries it. Private and
 * labelled Machine-read; nothing public reads it. A claim whose line is printed on the page offers "Use as a fact", which sends
 * only the line and the page to the Facts form; the AI's wording never goes into a field. Claims the page check could not
 * confirm are hidden until Aksh asks for them and offer nothing. Key this by document and page so it starts closed on each.
 */
export function DigestPanel({ documentId, pageNo, source, onUsed }: Props) {
  const result = useDigest(documentId, pageNo);
  const [showOff, setShowOff] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (result === null) return null;
  if (!result.ok) return <p className="text-small text-ink-muted">{result.message}</p>;
  if (result.lines.length === 0) return null;

  const confirmed = result.lines.filter((l) => l.onPage);
  const unconfirmed = result.lines.filter((l) => !l.onPage);

  function addAsFact(line: string) {
    const detail: AddFactDetail = { source, quote: line, locator: `p. ${pageNo}` };
    // Cancelled = the Facts form took it. No form listening, a sheet it cannot read, or a full list leaves it unsaid.
    const added = !window.dispatchEvent(new CustomEvent(ADD_FACT_EVENT, { detail, cancelable: true }));
    setNote(added ? DIGEST_FACT_ADDED : DIGEST_FACT_REFUSED);
    if (added) onUsed?.();
  }

  return (
    <details className="rounded-sm border border-rule bg-surface px-3 py-2" data-testid="digest-panel">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 text-small text-ink">
        <span className="rounded-sm border border-rule-strong px-1.5 py-0.5 font-mono text-mono-tag uppercase text-ink">{DIGEST_MARKER}</span>
        <span>{digestCount(result.lines.length)}</span>
      </summary>
      <div className="space-y-3 pb-1 pt-2">
        <p className="text-small text-ink-muted">{DIGEST_NOTE}</p>
        {confirmed.length > 0 ? (
          <ul className="space-y-2" aria-label="Machine-read claims">
            {confirmed.map((l, i) => (
              <Claim key={`${i}-${l.line}`} line={l}>
                <Button variant="outline" size="sm" onClick={() => addAsFact(l.line)}>
                  Use as a fact
                </Button>
              </Claim>
            ))}
          </ul>
        ) : null}
        {unconfirmed.length > 0 ? (
          <div className="space-y-2">
            <Button variant="link" size="sm" aria-expanded={showOff} onClick={() => setShowOff((v) => !v)}>
              {digestToggle(unconfirmed.length, showOff)}
            </Button>
            {showOff ? (
              <ul className="space-y-2" aria-label="Claims the page check could not confirm">
                {unconfirmed.map((l, i) => (
                  <Claim key={`${i}-${l.line}`} line={l}>
                    <p className="text-caption text-bad">{DIGEST_NOT_ON_PAGE}</p>
                  </Claim>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <p role="status" className="text-small text-ink-muted">
          {note ?? ""}
        </p>
      </div>
    </details>
  );
}
