import { PublicFrame } from "@/components/desk/public-frame";
import { RegisterTable } from "@/components/desk/register-table";
import { StatTile } from "@/components/desk/stat-tile";
import { StreakStrip } from "@/components/desk/streak-strip";
import { Unavailable } from "@/components/desk/unavailable";
import { UnitSquares } from "@/components/desk/unit-squares";
import { WhatChangedList } from "@/components/desk/what-changed-list";
import { formatCount, formatDate } from "@/lib/format";
import { totalTests } from "@/lib/test-status";
import { buildHomeStats, buildRegister, buildSiteChrome, buildWhatChanged, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;

/** Register home (segment 2 A) with B's What changed above it and B's stat tiles (segment 3). The h1 never animates. */
export default async function Home() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="desk" chrome={null} strip={{ variant: "site" }}>
        <Unavailable />
      </PublicFrame>
    );
  }
  const s = snapshot.data;
  const files = buildRegister(s);
  const stats = buildHomeStats(s);
  const last = files.map((f) => f.fileNo).sort((a, b) => Number(a) - Number(b)).at(-1);
  return (
    <PublicFrame current="desk" chrome={buildSiteChrome(s)} strip={{ variant: "site" }}>
      <header className="pt-8 pb-6">
        <p className="text-label uppercase text-ink-muted">{last ? `Case files 01 to ${last}` : "Case files"} · Indian listed companies</p>
        <h1 className="mt-2 text-display text-ink desk:text-display-desk">Case files</h1>
        <p className="prose-read mt-3 text-read text-ink-body desk:text-read-desk">
          Each file says what Aksh expected, what would prove him wrong, and every revision since. For learning, not advice.
        </p>
      </header>
      <section aria-label="The desk in counts" className="grid grid-cols-2 gap-4 desk:grid-cols-4">
        <StatTile label="Files" value={stats.files} unit="companies" context={`${formatCount(stats.sectors, "sector")}${stats.lastRevised ? ` · last ${formatDate(stats.lastRevised)}` : ""}`} />
        <StatTile label="Tests" value={totalTests(stats.tests)}>
          <UnitSquares counts={stats.tests} />
        </StatTile>
        <StatTile label="Revisions" value={stats.revisions} context="each with its reason" />
        <StatTile label="Logged" value={stats.logged.daysLogged} unit="of 30 days">
          <div className="mt-2">
            <StreakStrip {...stats.logged} />
          </div>
        </StatTile>
      </section>
      <div className="mt-(--section-gap) space-y-(--section-gap)">
        <WhatChangedList entries={buildWhatChanged(s)} />
        <RegisterTable files={files} searchable={false} />
      </div>
    </PublicFrame>
  );
}
