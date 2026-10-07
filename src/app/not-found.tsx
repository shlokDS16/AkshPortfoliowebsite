import Link from "next/link";
import { SiteDisclosureLine } from "@/components/desk/site-disclosure-line";
import { TopBar } from "@/components/desk/top-bar";

/** No database read: a 404 must render even when Supabase is paused. */
export default function NotFound() {
  return (
    <>
      <TopBar variant="home" />
      <main id="main" className="mx-auto max-w-read px-(--gutter) py-12">
        <h1 className="text-display text-ink desk:text-display-desk">No file at this address</h1>
        <p className="mt-3 text-read text-ink-body desk:text-read-desk">
          File numbers are never reused, so an old link may point to a file that was retracted. The <Link href="/companies">Files</Link> list shows
          every public file.
        </p>
      </main>
      <SiteDisclosureLine />
    </>
  );
}
