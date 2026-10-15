import type { ReactNode } from "react";
import { Machine } from "@/components/desk/case/case-entry";
import { istDate } from "@/lib/dates";
import { formatDate, formatTime } from "@/lib/format";
import type { VideoSourceRow } from "@/modules/distribution";
import { formatClock } from "@/modules/distribution/public";
import { PendingButton } from "../pending-button";

type Action = (formData: FormData) => Promise<void>;
type Props = { source: VideoSourceRow | null; off: boolean; itemTitle: string; fetchAgain: Action; useTitle: Action };

const PRIVACY = { public: "Public", unlisted: "Unlisted", private: "Private", gone: "Gone" } as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-2">
      <dt className="uppercase">{label}</dt>
      <dd className="break-words text-ink-body">{children}</dd>
    </div>
  );
}

/**
 * What YouTube answered about this video (spec s7.6), in the machine's face and labelled as YouTube's. None of it is his words: his title
 * only changes when he presses "Use this title". "Fetch again" asks YouTube again and refreshes this block; the desk never writes to YouTube.
 */
export function YoutubeBlock({ source, off, itemTitle, fetchAgain, useTitle }: Props) {
  // While off the status line above says so (once); there is nothing of YouTube's to show and no button that could work.
  if (off) return null;
  const fetchedAt = source?.fetchedAt ?? null;
  const again = (
    <form action={fetchAgain}>
      <PendingButton variant="outline" size="sm">
        Fetch again
      </PendingButton>
    </form>
  );
  if (!source || fetchedAt === null) {
    return (
      <div className="space-y-2">
        <p className="text-small text-ink-muted">Waiting for YouTube</p>
        {source?.fetchProblem ? (
          <p data-machine className="font-mono text-mono-tag text-ink-muted">
            {source.fetchProblem}
          </p>
        ) : null}
        {again}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p data-machine className="font-mono text-mono-label uppercase tabular-nums text-geru">
        From YouTube, fetched {formatDate(istDate(fetchedAt))}, {formatTime(fetchedAt)}
      </p>
      <Machine>
        <dl className="space-y-1">
          <Row label="Title">{source.ytTitle ?? "none"}</Row>
          <Row label="Channel">{source.ownChannel === null ? "Unknown" : source.ownChannel ? "Your channel" : "Not your channel"}</Row>
          <Row label="On YouTube">{source.privacy ? PRIVACY[source.privacy] : "Unknown"}</Row>
          <Row label="Length">{source.durationSeconds ? formatClock(source.durationSeconds) : "none"}</Row>
          <Row label="Published">{source.ytPublishedAt ? formatDate(istDate(source.ytPublishedAt)) : "none"}</Row>
        </dl>
        {source.fetchProblem ? <p className="mt-1">{source.fetchProblem}</p> : null}
        {source.ytDescription ? (
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink underline decoration-1 underline-offset-3 desk:min-h-8">Description from YouTube</summary>
            <p className="break-words whitespace-pre-wrap text-ink-body">{source.ytDescription}</p>
          </details>
        ) : null}
      </Machine>
      <div className="flex flex-wrap gap-2">
        {again}
        {source.ytTitle && source.ytTitle !== itemTitle ? (
          <form action={useTitle}>
            <PendingButton variant="outline" size="sm">
              Use this title
            </PendingButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
