import "server-only";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { istDate } from "@/lib/dates";
import { isBuildPhase } from "@/lib/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSnapshotLoader } from "./loader";
import { readLettersOpen } from "./letters-open";
import { createSupabaseShowcaseRepo, loadSnapshot } from "./repo";
import type { PublicSnapshot, VideoSegment } from "./types";
import { transcriptKey } from "./videos";
import { transcriptMatches } from "./video-transcript";

// One cached read of the five public views for every public page; publish/unpublish call
// updateTag(CACHE_TAGS.publicItems) (Plan 1A Task 9), so a gated change is visible at once.
// Rule 10 (Plan 1A ruling R6): the cookie-less public client only, never the service client.
const cachedSnapshot = unstable_cache(
  async () => loadSnapshot(createSupabaseShowcaseRepo(createSupabasePublicClient()), istDate(new Date())),
  ["showcase-snapshot-v4"],
  { tags: [CACHE_TAGS.publicItems], revalidate: 3600 },
);

export const getSnapshot = createSnapshotLoader({ load: cachedSnapshot, isBuildPhase });

// A transcript is read per video, not with the snapshot: the data cache holds an entry up to 2 MB and an hour of speech is about 60 KB, so a
// library of videos would push the one shared snapshot over it. Same tag, so publish and unpublish refresh both together.
const cachedTranscript = unstable_cache(
  async (itemId: string) => createSupabaseShowcaseRepo(createSupabasePublicClient()).videoTranscript(itemId),
  ["showcase-video-transcript-v1"],
  { tags: [CACHE_TAGS.publicItems], revalidate: 3600 },
);

/**
 * The transcript of a listed video's CURRENT revision, checked against the hash that revision names. Null: not a listed video or no
 * transcript. A transcript that does not match (the two caches caught between a publish and its refresh) throws, so a running site keeps its
 * last good page (D12); at build time it is no transcript.
 */
export async function getVideoTranscript(s: PublicSnapshot, slug: string): Promise<VideoSegment[] | null> {
  const key = transcriptKey(s, slug);
  if (!key) return null;
  const segments = await cachedTranscript(key.itemId);
  if (!segments) return null;
  if (transcriptMatches(segments, key.sha)) return segments;
  if (isBuildPhase()) return null;
  throw new Error("showcase: the stored transcript does not match the revision");
}

// Plan 5c: are sign-ups for the letters open? The same public tag as the snapshot (the desk's switch refreshes it), and a short life of its own:
// five minutes at most between Aksh closing the door and the form going. Throws when the database cannot be read, so a wrong "closed" is never kept.
export const getLettersOpen = unstable_cache(
  async () => readLettersOpen(createSupabasePublicClient()),
  ["showcase-letters-open-v1"],
  { tags: [CACHE_TAGS.publicItems], revalidate: 300 },
);
