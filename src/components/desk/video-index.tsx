import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { VideoSummary } from "@/modules/showcase";

/**
 * /videos: title, his objective, the revision date and the length, newest first. No thumbnail: the index loads nothing from YouTube, so a
 * visitor who never opens a video never talks to Google. The page is a 404 until a video is listed, so there is no empty state.
 */
export function VideoIndex({ videos }: { videos: VideoSummary[] }) {
  return (
    <ol className="divide-y divide-rule">
      {videos.map((v) => (
        <li key={v.slug} className="py-(--row-y)">
          <Link href={v.href} className="text-subtitle desk:text-subtitle-desk">
            {v.title}
          </Link>
          <p className="text-body text-ink-body">{v.learningObjective}</p>
          <p data-machine className="text-small tabular-nums text-ink-muted">
            Revised {formatDate(v.revisedOn)}
            {v.durationLabel ? ` · ${v.durationLabel}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
