import type { ReactNode } from "react";
import { AsOf, Withheld } from "@/components/desk/as-of";
import { BlockHeader } from "@/components/desk/block-header";
import { ComplianceStrip } from "@/components/desk/compliance-strip";
import { Dateline } from "@/components/desk/dateline";
import { DeskRail } from "@/components/desk/desk-rail";
import { Disclosure } from "@/components/desk/disclosure";
import { EmptyState } from "@/components/desk/empty-state";
import { Exhibit } from "@/components/desk/exhibit";
import { FactTable } from "@/components/desk/fact-table";
import { FileTag } from "@/components/desk/id-mark";
import { KillCriteriaTable } from "@/components/desk/kill-criteria-table";
import { PhoneIndex } from "@/components/desk/phone-index";
import { ReadFirst } from "@/components/desk/read-first";
import { RegisterTable } from "@/components/desk/register-table";
import { RevisionDiff } from "@/components/desk/revision-diff";
import { RevisionLog } from "@/components/desk/revision-log";
import { ScenarioTable } from "@/components/desk/scenario-table";
import { SourceList } from "@/components/desk/source-list";
import { StatTile } from "@/components/desk/stat-tile";
import { StreakStrip } from "@/components/desk/streak-strip";
import { TabBar } from "@/components/desk/tab-bar";
import { TopBar } from "@/components/desk/top-bar";
import { UnitSquares } from "@/components/desk/unit-squares";
import { UsedIn } from "@/components/desk/used-in";
import { ViewBlock } from "@/components/desk/view-block";
import { WhatChangedList } from "@/components/desk/what-changed-list";
import { Skeleton } from "@/components/ui/skeleton";
import * as F from "@/test/fixtures/desk-ui";
import { ThemeSwitch } from "./theme-switch";

function Spec({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-(--block-gap)">
      <p className="mb-3 font-mono text-mono-label uppercase text-ink-muted">{name}</p>
      {children}
    </section>
  );
}

/** Every desk component in its states (component-inventory conventions). Development only. */
export default function Preview() {
  return (
    <>
      <TopBar variant="file" />
      <ComplianceStrip variant="file" holdsPosition="no" dataAsOf="2026-06-30" />
      <PhoneIndex sections={F.FILE_SECTIONS} />
      <div className="mx-auto flex max-w-page gap-8 px-(--gutter)">
        <DeskRail current="files" counts={F.SITE_COUNTS} streak={F.STREAK} file={{ fileNo: "01", shortName: "Kaveri Pumps", sections: F.FILE_SECTIONS }} />
        <main id="file-body" className="min-w-0 flex-1 pb-24">
          <div className="py-4">
            <ThemeSwitch />
          </div>
          <Spec name="FileTag · Dateline · ReadFirst">
            <FileTag fileNo="01" revNo={2} />
            <Dateline {...F.DATELINE} />
            <ReadFirst notes={F.READ_FIRST} />
          </Spec>
          <Spec name="VIEW">
            <BlockHeader label="VIEW" id="view" title="Aksh's view" sub="His own words. Each figure opens the line it came from." />
            <ViewBlock blocks={F.VIEW_BLOCKS} />
            <ViewBlock blocks={[]} />
          </Spec>
          <Spec name="TESTS">
            <BlockHeader label="TESTS" id="tests" title="I would be wrong if" sub={`3 tests Aksh set himself. "Met" means his view is wrong.`} />
            <KillCriteriaTable tests={F.KILL_TESTS} />
          </Spec>
          <Spec name="FACTS · Exhibit · Scenario · Sources">
            <BlockHeader label="FACTS" id="facts" title="Source facts" sub="Taken from filings. Each row names its source and date." />
            <Exhibit data={F.EXHIBIT} />
            <FactTable groups={F.FACT_GROUPS} />
            <ScenarioTable data={F.SCENARIO} />
            <SourceList sources={F.SOURCES} />
          </Spec>
          <Spec name="HISTORY">
            <BlockHeader label="HISTORY" id="history" title="Revisions" />
            <RevisionDiff data={F.REVISION_DIFF} />
            <RevisionLog revisions={F.REVISION_LOG} />
            <RevisionDiff data={null} />
          </Spec>
          <Spec name="Home">
            <div className="grid grid-cols-2 gap-4 desk:grid-cols-4">
              <StatTile label="Files" value={F.HOME_STATS.files} unit="companies" context="2 sectors · last 20 Aug 2026" />
              <StatTile label="Tests" value={5}>
                <UnitSquares counts={F.HOME_STATS.tests} />
              </StatTile>
              <StatTile label="Revisions" value={0} />
              <StatTile label="Logged" value={22} unit="of 30 days">
                <StreakStrip {...F.STREAK} />
              </StatTile>
            </div>
            <WhatChangedList entries={F.WHAT_CHANGED} />
            <RegisterTable files={F.REGISTER} />
            <RegisterTable files={[]} searchable={false} />
          </Spec>
          <Spec name="Learning note · empty · skeleton · dating">
            <UsedIn uses={F.USED_IN} />
            <EmptyState body="Nothing here yet." shape={["File and test", "Date", "Original text"]} />
            <Skeleton className="h-4 w-2/3" />
            <p>
              <AsOf date="2026-06-30" /> · <Withheld availableOn="2026-11-12" />
            </p>
          </Spec>
          <Disclosure holdsPosition="no" reviewedOn="2026-08-20" />
        </main>
      </div>
      <TabBar current="files" counts={{ files: 2, notes: 2 }} hideOnScroll />
    </>
  );
}
