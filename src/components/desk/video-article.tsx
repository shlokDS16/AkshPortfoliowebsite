import { formatDate } from "@/lib/format";
import type { TranscriptLine, VideoView } from "@/modules/showcase";
import { Disclosure, SITE_POSITION } from "./disclosure";
import { PrintButton } from "./print-button";
import { PrintDisclosure } from "./print-disclosure";
import { VideoPlayer } from "./video-player";
import { VideoTranscript } from "./video-transcript";
import { ViewBlock } from "./view-block";

/**
 * /videos/[slug] (spec s7.7). His side: the title, "What this teaches", the description he wrote and his chapter titles, in the reading face.
 * The machine's side, in the mono face: the dateline, the length, the dates, the transcript and its label. The player loads nothing from
 * YouTube until the press. A video that names a company shows the Disclosure block; any other prints the standard disclosure.
 */
export function VideoArticle({ video, lines }: { video: VideoView; lines: TranscriptLine[] }) {
  return (
    <article className="pt-8 desk:max-w-read">
      <span className="file-tag inline-block bg-geru py-0.5 pr-2.5 pl-2 font-mono text-mono-tag uppercase text-on-geru">VIDEO</span>
      <h1 className="mt-3 text-display text-ink desk:text-display-desk">{video.title}</h1>
      <p className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
        <span className="text-label uppercase text-ink-muted">What this teaches </span>
        {video.learningObjective}
      </p>
      <p data-machine data-dateline className="mt-2 font-mono text-mono-tag tabular-nums text-ink-muted">
        Revised {formatDate(video.revisedOn)} · first written {formatDate(video.firstWrittenOn)} · R{video.revNo} of {video.revCount}
        {video.durationLabel ? ` · ${video.durationLabel}` : ""}
        {video.uploadedOn ? ` · Uploaded ${formatDate(video.uploadedOn)}` : ""}
      </p>
      <div className="mt-3 print:hidden">
        <PrintButton />
      </div>
      <VideoPlayer youtubeId={video.youtubeId} title={video.title} thumbnail={video.thumbnail} durationLabel={video.durationLabel} chapters={video.chapters} />
      {video.body.length > 0 ? (
        <div className="mt-(--block-gap)">
          <ViewBlock blocks={video.body} />
        </div>
      ) : null}
      <VideoTranscript lines={lines} />
      {video.holdsPosition ? (
        <div className="mt-(--section-gap)">
          <Disclosure holdsPosition={video.holdsPosition} reviewedOn={video.revisedOn} />
        </div>
      ) : (
        <PrintDisclosure position={SITE_POSITION} reviewedOn={video.revisedOn} />
      )}
    </article>
  );
}
