import type { VideoMeta, VideoMetaPort } from "./video-meta";

// The fixture video-metadata port (Phase 5b): local e2e and CI only, never on Vercel (createVideoMetaPort refuses it there, like the
// other fixtures). It never calls YouTube. The id's first letters pick the case, so a test can reach each gate path:
// "missing..." is not returned, "other..." is another channel, "private..." and "public..." set the privacy; anything else is an
// unlisted video of the fixture channel with three chapter lines in its description.

export const FIXTURE_CHANNEL_ID = "UCfixturefixturefixture0";
const OTHER_CHANNEL_ID = "UCotherotherotherother00";
export const FIXTURE_DESCRIPTION = "A made-up description for tests.\n\n0:00 Opening\n0:30 The middle\n1:00 The end";

export function createFixtureVideoMeta(options: { channelId?: string } = {}): VideoMetaPort {
  const channelId = options.channelId ?? FIXTURE_CHANNEL_ID;
  const metaFor = (id: string): VideoMeta | "missing" => {
    if (id.startsWith("missing")) return "missing";
    return {
      channelId: id.startsWith("other") ? OTHER_CHANNEL_ID : channelId,
      title: `Fixture video ${id}`,
      description: FIXTURE_DESCRIPTION,
      durationSeconds: 600,
      privacy: id.startsWith("private") ? "private" : id.startsWith("public") ? "public" : "unlisted",
      publishedAt: "2026-09-01T10:00:00.000Z",
    };
  };
  return {
    name: "fixture",
    ownChannelId: channelId,
    async fetch(ids) {
      return { kind: "ok", videos: new Map([...new Set(ids)].map((id) => [id, metaFor(id)])) };
    },
  };
}
