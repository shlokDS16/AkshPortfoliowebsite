import Link from "next/link";
import { VideoList } from "@/components/desk/private/videos/video-list";
import { istDate } from "@/lib/dates";
import { errorText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listVideoRows } from "@/modules/distribution";
import { requireAdmin } from "@/modules/identity";
import { videoListingOn } from "@/modules/ops/jobs";

/** /desk/videos (spec s7.6): every video, newest first, each with one status in words. No sixth tab (D54): Items stays current and a link leads here. */
export default async function VideosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const rows = await listVideoRows(await createSupabaseServerClient());
  const errorMessage = errorText(error);
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="text-title text-ink desk:text-title-desk">Videos</h1>
      <p className="max-w-[72ch] text-small text-ink-muted">Upload to YouTube as Unlisted, then put v: and its link in the capture box. The desk reads YouTube; it never changes anything there.</p>
      <nav aria-label="Items" className="flex flex-wrap gap-x-5 text-small">
        <Link href="/desk/items" className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-3">
          Items
        </Link>
      </nav>
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      <VideoList rows={rows} off={!videoListingOn()} today={istDate(new Date())} now={new Date().getTime()} />
    </div>
  );
}
