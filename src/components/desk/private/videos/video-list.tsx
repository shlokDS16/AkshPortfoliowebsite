import Link from "next/link";
import { istDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { videoStatus, type VideoListRow } from "@/modules/distribution";
import { VideoStatusLine } from "./video-status-line";

type Props = { rows: VideoListRow[]; off: boolean; today: string; now: number };

/** /desk/videos (spec s7.6): his title, one status line in words, the date it was added. The status is computed here from the rows, advisory like the checklist. */
export function VideoList({ rows, off, today, now }: Props) {
  if (rows.length === 0) return <p className="text-small text-ink-muted">No videos yet. Put v: and a YouTube link in the capture box.</p>;
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => {
        const status = videoStatus({
          off, source: r.source, structured: r.structured, latestTranscriptId: r.latestTranscriptId, companyNamed: r.companyNamed, dataAsOf: r.dataAsOf, today, now,
          listed: r.visibility === "public",
        });
        return (
          <li key={r.itemId} className="space-y-1 py-(--row-y)">
            <Link href={`/desk/videos/${r.itemId}`} className="inline-flex min-h-11 items-center text-subtitle underline decoration-1 underline-offset-3 desk:min-h-8">
              {r.title}
            </Link>
            <VideoStatusLine status={status} />
            <p data-machine className="font-mono text-mono-tag tabular-nums text-ink-muted">
              Added {formatDate(istDate(r.createdAt))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
