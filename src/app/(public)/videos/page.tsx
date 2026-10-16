import { notFound } from "next/navigation";
import { SITE_POSITION } from "@/components/desk/disclosure";
import { JsonLd } from "@/components/desk/json-ld";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { VideoIndex } from "@/components/desk/video-index";
import { publicEnv } from "@/lib/env";
import { buildSiteChrome, getSnapshot, jsonLdFor, listVideoSummaries, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata = pageMetadata("videos", null);

/** Plan 5b (spec s7.7): a 404 until a video is listed, so merging this changes nothing a visitor can see. Newest first; loads nothing from YouTube. */
export default async function VideosPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="videos" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Videos" />
      </PublicFrame>
    );
  }
  const videos = listVideoSummaries(snapshot.data);
  if (videos.length === 0) notFound();
  return (
    <PublicFrame current="videos" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Videos</h1>
      <div className="mt-(--block-gap)">
        <VideoIndex videos={videos} />
      </div>
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.data.today} />
      <JsonLd data={jsonLdFor("videos", snapshot.data, undefined, publicEnv().NEXT_PUBLIC_SITE_URL)} />
    </PublicFrame>
  );
}
