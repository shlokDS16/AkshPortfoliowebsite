import { Machine } from "@/components/desk/case/case-entry";
import { istDate } from "@/lib/dates";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import type { TranscriptRow } from "@/modules/distribution";
import { formatClock } from "@/modules/distribution/public";
import { PendingButton } from "../pending-button";

const FIRST = 20;

function Rows({ segments, first }: { segments: TranscriptRow["segments"]; first?: boolean }) {
  return (
    <ol {...(first ? { "data-first": "" } : {})} className="space-y-1">
      {segments.map((g) => (
        <li key={g.s} className="grid grid-cols-[3.75rem_1fr] gap-x-2">
          <span>{formatClock(g.s)}</span>
          <span className="break-words whitespace-pre-wrap text-ink-body">{g.t}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The newest stored transcript (spec s7.6): its first 20 segments as text, the rest behind Show all, and "Use this transcript". It is the machine's
 * record of what was said: there is no field to edit it, here or anywhere. A mis-heard word is fixed in YouTube Studio and the file dropped again.
 */
export function TranscriptPreview({ transcript, inRevision, useAction }: { transcript: TranscriptRow | null; inRevision: boolean; useAction: (formData: FormData) => Promise<void> }) {
  if (!transcript) return <p className="text-small text-ink-muted">No transcript stored yet.</p>;
  const { segments } = transcript;
  return (
    <div className="space-y-3">
      <p data-machine className="font-mono text-mono-tag tabular-nums text-ink-muted">
        Stored {formatDate(istDate(transcript.createdAt))}, {formatTime(transcript.createdAt)} · {formatNumber(transcript.words ?? 0, 0)} words · {segments.length} segments
      </p>
      <Machine>
        <Rows segments={segments.slice(0, FIRST)} first />
        {segments.length > FIRST ? (
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink underline decoration-1 underline-offset-3 desk:min-h-8">Show all {segments.length} segments</summary>
            <Rows segments={segments.slice(FIRST)} />
          </details>
        ) : null}
      </Machine>
      {inRevision ? (
        <p className="text-small text-ink">This transcript is in the latest revision.</p>
      ) : (
        <form action={useAction}>
          <PendingButton variant="outline" size="sm">
            Use this transcript
          </PendingButton>
        </form>
      )}
    </div>
  );
}
