import Link from "next/link";
import { Machine } from "@/components/desk/case/case-entry";
import { istDate } from "@/lib/dates";
import { longDate, type SourceRecord } from "@/modules/sources/client";

export type ConceptSourceLine = { id: string; title: string | null; site: string | null; host: string; kind: "youtube" | "web"; savedOn: string };

/**
 * The concept page's "Sources" (Phase 5d, spec s6.5): the saved sources attached to this concept, newest first, read only. The title is the machine's
 * (a link not read yet shows its host, never an invented title); the full list, with his notes and the actions, is on the Sources page.
 */
export function ConceptSources({ slug, lines, total }: { slug: string; lines: readonly ConceptSourceLine[]; total: number }) {
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="sources-h" className="space-y-1">
      <h2 id="sources-h" className="text-title text-ink desk:text-title-desk">
        Sources
      </h2>
      <ul className="divide-y divide-rule">
        {lines.map((l) => (
          <li key={l.id} className="py-2">
            <Machine className="space-y-0.5">
              <p className="break-words text-data text-ink desk:text-data-desk">{l.title ?? l.host}</p>
              <p>
                {l.site ?? (l.title ? l.host : l.kind === "youtube" ? "YouTube" : "Page")} · Saved {longDate(l.savedOn)}
              </p>
            </Machine>
          </li>
        ))}
      </ul>
      <Link href={`/desk/sources?concept=${slug}`} className="inline-flex min-h-11 items-center text-small text-ink underline decoration-1 underline-offset-3 desk:min-h-8">
        See all {total} in Sources
      </Link>
    </section>
  );
}

const SHOWN = 8;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The lines for a concept's saved sources (newest first, as the list gives them): the first eight, and the total. */
export function conceptSourceLines(records: readonly SourceRecord[]): { lines: ConceptSourceLine[]; total: number } {
  return {
    total: records.length,
    lines: records.slice(0, SHOWN).map((r) => ({ id: r.id, title: r.title, site: r.siteName, host: hostOf(r.url), kind: r.kind, savedOn: istDate(r.createdAt) })),
  };
}
