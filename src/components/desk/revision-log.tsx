import { formatDate } from "@/lib/format";
import type { RevisionLogEntry } from "@/lib/view-types";
import { IdMark } from "./id-mark";

type Props = { revisions: RevisionLogEntry[]; label?: (revNo: number) => string };

/** Spec RevisionTimeline: every gated revision with its date and reason, newest first. */
export function RevisionLog({ revisions, label = (n) => `R${n}` }: Props) {
  return (
    <ol reversed className="mt-4 space-y-2 text-small desk:text-small-desk">
      {revisions.map((r) => (
        <li key={r.revNo} className="grid grid-cols-[3rem_6.5rem_1fr] gap-x-2">
          <IdMark kind="revision" value={label(r.revNo)} />
          <span className="tabular-nums text-ink-muted">{formatDate(r.on)}</span>
          <span>{r.reason}</span>
        </li>
      ))}
    </ol>
  );
}
