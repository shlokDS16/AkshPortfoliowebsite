import type { ReactNode } from "react";
import type { FileNo, HoldsPosition, ISODate } from "@/lib/desk-types";
import type { RailCurrent, RailSection, SiteChrome, TabCurrent } from "@/lib/view-types";
import { ComplianceStrip } from "./compliance-strip";
import { DeskRail } from "./desk-rail";
import { SiteDisclosureLine } from "./site-disclosure-line";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

type Strip = { variant: "site" } | { variant: "file"; holdsPosition: HoldsPosition; dataAsOf: ISODate };
type Props = {
  current: RailCurrent;
  chrome: SiteChrome | null;
  strip: Strip;
  topBar?: "home" | "file";
  file?: { fileNo: FileNo; shortName: string; sections: RailSection[] };
  children: ReactNode;
};

export function tabFor(current: RailCurrent): TabCurrent | null {
  return current === "desk" || current === "files" || current === "notes" || current === "about" ? current : null;
}

/**
 * Segment 2: one rail on desktop, four tabs on phone (hidden while scrolling a file), the site disclosure at the top
 * on desktop and the bottom on phone; on a file the strip is the only disclosure summary (design-dna 8.2-8.3).
 */
export function PublicFrame({ current, chrome, strip, topBar = "home", file, children }: Props) {
  return (
    <>
      {strip.variant === "site" ? (
        <div className="hidden desk:block">
          <ComplianceStrip variant="site" />
        </div>
      ) : null}
      <TopBar variant={topBar} />
      <div className="mx-auto flex max-w-page gap-8 desk:px-(--gutter)">
        {chrome ? <DeskRail current={current} counts={chrome.counts} streak={chrome.streak} file={file} /> : null}
        <main id="main" className="min-w-0 flex-1 px-(--gutter) pb-[calc(var(--tab-bar-h)+2rem)] desk:px-0 desk:pb-16">
          {strip.variant === "file" ? (
            <div className="-mx-(--gutter) desk:mx-0">
              <ComplianceStrip variant="file" holdsPosition={strip.holdsPosition} dataAsOf={strip.dataAsOf} />
            </div>
          ) : null}
          {children}
        </main>
      </div>
      {strip.variant === "site" ? <SiteDisclosureLine /> : null}
      <TabBar current={tabFor(current)} counts={{ files: chrome?.counts.files ?? 0, notes: chrome?.counts.notes ?? 0 }} hideOnScroll={strip.variant === "file"} />
    </>
  );
}
