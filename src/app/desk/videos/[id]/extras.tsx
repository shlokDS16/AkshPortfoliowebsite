import { CaptionDrop } from "@/components/desk/private/videos/caption-drop";
import { ChaptersPreview } from "@/components/desk/private/videos/chapters-preview";
import { TranscriptPreview } from "@/components/desk/private/videos/transcript-preview";
import { VideoStatusLine } from "@/components/desk/private/videos/video-status-line";
import { YoutubeBlock } from "@/components/desk/private/videos/youtube-block";
import { istDate } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addTranscriptAction, fetchAgainAction, useChaptersAction, useTitleAction, useTranscriptAction } from "@/modules/distribution/actions";
import { chaptersOf, createSupabaseVideosRepo, videoChecks, videoStatus, type VideoFacts } from "@/modules/distribution";
import { videoListingOn } from "@/modules/ops/jobs";
import type { EditorData, VideoExtras } from "../../items/[id]/item-view";

const H3 = "text-subtitle text-ink desk:text-subtitle-desk";

/**
 * The video page's own panels (spec s7.6), built from the item the page already loaded plus the video's source and its newest stored transcript.
 * Machine data (YouTube's answer, the transcript) is read here and shown in the machine face; nothing here writes it. Every number the page shows
 * is computed from these rows at request time, so there is no clock in a client component.
 */
export async function videoExtras(data: EditorData): Promise<VideoExtras> {
  const { item, latest } = data;
  const videos = createSupabaseVideosRepo(await createSupabaseServerClient());
  const source = await videos.findByItem(item.id);
  const transcript = source ? await videos.latestTranscript(source.id) : null;
  const off = !videoListingOn();
  const structured = latest?.structured ?? {};
  const facts: VideoFacts = {
    off,
    source: source ? { youtubeId: source.youtubeId, ownChannel: source.ownChannel, privacy: source.privacy, fetchedAt: source.fetchedAt, fetchProblem: source.fetchProblem } : null,
    structured, latestTranscriptId: transcript?.id ?? null, companyNamed: item.companyId !== null, dataAsOf: item.dataAsOf,
    today: istDate(new Date()), now: new Date().getTime(), listed: item.visibility === "public",
  };
  const id = item.id;
  const panel = (
    <section aria-labelledby="video-heading" className="max-w-[72ch] space-y-5">
      <h2 id="video-heading" className="text-title text-ink desk:text-title-desk">
        Video
      </h2>
      <VideoStatusLine status={videoStatus(facts)} long />
      <YoutubeBlock source={source} off={off} itemTitle={item.title} fetchAgain={fetchAgainAction.bind(null, id)} useTitle={useTitleAction.bind(null, id)} />
      <div className="space-y-3">
        <h3 className={H3}>Transcript</h3>
        <CaptionDrop action={addTranscriptAction.bind(null, id)} />
        <TranscriptPreview transcript={transcript} inRevision={transcript !== null && (structured as { transcriptId?: unknown }).transcriptId === transcript.id} useAction={useTranscriptAction.bind(null, id)} />
      </div>
      <div className="space-y-3">
        <h3 className={H3}>Chapters</h3>
        <ChaptersPreview description={source?.fetchedAt ? (source.ytDescription ?? "") : null} current={chaptersOf((structured as { chapters?: unknown }).chapters)} useAction={useChaptersAction.bind(null, id)} />
      </div>
    </section>
  );
  return { panel, checks: videoChecks(facts) };
}
