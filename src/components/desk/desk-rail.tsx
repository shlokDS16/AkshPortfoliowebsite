import { cn } from "@/lib/utils";
import Link from "next/link";
import { CountFlow } from "@/components/ui/count-flow";
import type { FileNo } from "@/lib/desk-types";
import type { RailCurrent, RailSection, SiteCounts, StreakData } from "@/lib/view-types";
import { RailFileSections } from "./rail-file-sections";
import { StreakStrip } from "./streak-strip";

type Props = {
  current: RailCurrent;
  counts: SiteCounts;
  streak: StreakData;
  file?: { fileNo: FileNo; shortName: string; sections: RailSection[] };
};

const SITE: { id: RailCurrent; label: string; href: string; count?: keyof SiteCounts }[] = [
  { id: "desk", label: "Desk", href: "/" },
  { id: "files", label: "Files", href: "/companies", count: "files" },
  { id: "notes", label: "Learning notes", href: "/notes", count: "notes" },
  { id: "process", label: "Process", href: "/process", count: "process" },
  { id: "mistakes", label: "Mistakes", href: "/mistakes", count: "mistakes" },
  { id: "about", label: "About and disclosures", href: "/about" },
];

/** The one desktop rail (segment 2). Counts render even at 0; About is always present. */
export function DeskRail({ current, counts, streak, file }: Props) {
  return (
    <nav
      aria-label="Site"
      className="sticky top-(--top-bar-h) hidden max-h-[calc(100dvh-var(--top-bar-h))] w-(--rail-w) shrink-0 overflow-y-auto border-r border-rule py-6 pr-4 desk:block"
    >
      <ul className="space-y-1 text-small desk:text-small-desk">
        {SITE.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              aria-current={s.id === current ? "page" : undefined}
              className={cn("flex min-h-8 items-center justify-between rounded-xs px-2 text-ink no-underline hover:bg-surface-2", s.id === current && "bg-surface-2 font-semibold")}
            >
              <span>{s.label}</span>
              {s.count ? <CountFlow value={counts[s.count]} className="tabular-nums text-ink-muted" /> : null}
            </Link>
            {s.id === "files" && file ? <RailFileSections fileNo={file.fileNo} shortName={file.shortName} sections={file.sections} /> : null}
          </li>
        ))}
      </ul>
      <StreakStrip {...streak} variant="rail" />
    </nav>
  );
}
