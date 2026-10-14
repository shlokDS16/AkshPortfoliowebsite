import Link from "next/link";
import { formatDate } from "@/lib/format";
import { HAND_EMPTY, HAND_NOTE, RESTATED_EMPTY, RESTATED_NOTE, UPLOADS_EMPTY, UPLOADS_NOTE } from "@/lib/messages-closes";
import type { HandCloseLine, RestatedLine, UploadLine } from "@/modules/ledger/client";

/** Closes that are not NSE's own fetched file, each with where it came from. */
export function HandCloses({ closes }: { closes: HandCloseLine[] }) {
  return (
    <div className="space-y-2">
      <p className="text-small text-ink-muted">{HAND_NOTE}</p>
      {closes.length === 0 ? (
        <p className="text-small text-ink-body">{HAND_EMPTY}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule" aria-label="Closes you typed or dropped">
          {closes.map((c) => (
            <li key={`${c.symbol}-${c.date}-${c.sourceText}`} data-hand className="grid grid-cols-[7.5rem_1fr] gap-x-3 py-2 text-small tabular-nums desk:text-small-desk">
              <span className="text-ink">{formatDate(c.date)}</span>
              <span className="text-ink-body">
                <span className="font-medium text-ink">{c.companyName}</span>
                {c.symbol ? <span className="ml-2 font-mono text-mono-id text-ink-muted">{c.symbol}</span> : null}
                <span className="block">
                  Close {c.close}, {c.sourceText}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Every official-file upload on record, newest first: when, for which trading date, the first 12 characters of the file's hash, what it did. */
export function UploadRecords({ uploads }: { uploads: UploadLine[] }) {
  return (
    <div className="space-y-2">
      <p className="max-w-[62ch] text-small text-ink-muted">{UPLOADS_NOTE}</p>
      {uploads.length === 0 ? (
        <p className="text-small text-ink-body">{UPLOADS_EMPTY}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule" aria-label="Files you uploaded">
          {uploads.map((u) => (
            <li key={u.id} data-upload className="grid grid-cols-[11rem_1fr] gap-x-3 py-2 text-small tabular-nums desk:text-small-desk">
              <span className="text-ink">
                {u.uploadedOn}, {u.uploadedAt}
              </span>
              <span className="text-ink-body">
                For {formatDate(u.tradeDate)}, file <span className="font-mono text-mono-id text-ink">{u.hash12}</span>, {u.countsText}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The scores a stored close or a correction changed, with a link to each idea (its page shows the old and the new figure). */
export function RestatedScores({ items }: { items: RestatedLine[] }) {
  return (
    <div className="space-y-2">
      <p className="text-small text-ink-muted">{RESTATED_NOTE}</p>
      {items.length === 0 ? (
        <p className="text-small text-ink-body">{RESTATED_EMPTY}</p>
      ) : (
        <ul className="space-y-2" aria-label="Scores restated lately">
          {items.map((r) => (
            <li key={r.restated.id} data-restated={r.restated.id} className="text-small text-ink-body">
              <Link href={`/desk/ledger/${r.ideaId}`} className="font-medium text-ink underline decoration-1 underline-offset-3">
                {r.name}
              </Link>
              : {r.restated.headline.charAt(0).toLowerCase() + r.restated.headline.slice(1)}
              {r.restated.lines.length > 0 ? (
                <ul className="tabular-nums text-caption text-ink-muted">
                  {r.restated.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
