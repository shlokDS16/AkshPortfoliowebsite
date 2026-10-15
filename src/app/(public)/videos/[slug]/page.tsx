import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/desk/json-ld";
import { PrintMasthead } from "@/components/desk/print-masthead";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { VideoArticle } from "@/components/desk/video-article";
import { publicEnv } from "@/lib/env";
import { transcriptPlainText } from "@/modules/distribution/public";
import { buildSiteChrome, buildVideoView, getSnapshot, getVideoTranscript, jsonLdFor, pageMetadata, transcriptLines } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/videos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  return pageMetadata("video", snapshot.status === "ok" ? snapshot.data : null, slug);
}

/**
 * Snapshot only (rule 10): a video is public when it passed the gate and has a row in public_videos; anything else is a 404. The transcript is
 * read apart and must match the hash the current revision names, so the page never shows a transcript the gate did not lint.
 */
export default async function VideoPage({ params }: PageProps<"/videos/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="videos" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Video" />
      </PublicFrame>
    );
  }
  const video = buildVideoView(snapshot.data, slug);
  if (!video) notFound();
  const segments = await getVideoTranscript(snapshot.data, slug);
  const lines = segments ? transcriptLines(segments) : [];
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  return (
    <PublicFrame
      current="videos"
      chrome={buildSiteChrome(snapshot.data)}
      strip={{ variant: "site" }}
      printMasthead={<PrintMasthead address={`${siteUrl}/videos/${video.slug}`} revNo={video.revNo} revisedOn={video.revisedOn} figuresTo={video.dataAsOf} />}
    >
      <VideoArticle video={video} lines={lines} />
      <JsonLd data={jsonLdFor("video", snapshot.data, slug, siteUrl, segments ? { transcript: transcriptPlainText(segments) } : undefined)} />
    </PublicFrame>
  );
}
