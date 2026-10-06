import "server-only";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { istDate } from "@/lib/dates";
import { isBuildPhase } from "@/lib/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSnapshotLoader } from "./loader";
import { createSupabaseShowcaseRepo, loadSnapshot } from "./repo";

// One cached read of the four public views for every public page; publish/unpublish call
// updateTag(CACHE_TAGS.publicItems) (Plan 1A Task 9), so a gated change is visible at once.
// Rule 10 (Plan 1A ruling R6): the cookie-less public client only, never the service client.
const cachedSnapshot = unstable_cache(
  async () => loadSnapshot(createSupabaseShowcaseRepo(createSupabasePublicClient()), istDate(new Date())),
  ["showcase-snapshot-v1"],
  { tags: [CACHE_TAGS.publicItems], revalidate: 3600 },
);

export const getSnapshot = createSnapshotLoader({ load: cachedSnapshot, isBuildPhase });
