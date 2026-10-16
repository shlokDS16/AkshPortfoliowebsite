import Link from "next/link";

const link = "inline-flex min-h-11 items-center underline decoration-1 underline-offset-3";

/** "A, B and C", the way the nav's accessible name read before (Phase 5d only drops the words of what is hidden). */
const words = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

/**
 * The links under the Items title. Videos and Letters appear only while their feature is on (spec s8: no route or entry point is visible while off);
 * the page asks `featureOn` and hands the answers down.
 */
export function ItemsSubnav({ ownVideos, letters }: { ownVideos: boolean; letters: boolean }) {
  const label = words(["Concepts", "the month", ...(ownVideos ? ["videos"] : []), ...(letters ? ["letters"] : [])]);
  return (
    <nav aria-label={label} className="flex flex-wrap gap-x-5 text-small">
      <Link href="/desk/concepts" className={link}>
        Concepts
      </Link>
      <Link href="/desk/learned" className={link}>
        This month
      </Link>
      {ownVideos ? (
        <Link href="/desk/videos" className={link}>
          Videos
        </Link>
      ) : null}
      {letters ? (
        <Link href="/desk/letters" className={link}>
          Letters
        </Link>
      ) : null}
    </nav>
  );
}
