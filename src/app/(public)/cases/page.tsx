import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseList } from "@/components/desk/case/case-list";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildSiteChrome, getSnapshot, hasLedgerCases, listCaseSummaries } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Closed cases", description: "Ideas Aksh has closed and written up: what he expected, what happened and what he learned." };

/** Plan 3b D37: a 404 until one ledger case study is public, so merging this changes nothing a visitor can see. No navigation tab. */
export default async function CasesPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="cases" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Closed cases" />
      </PublicFrame>
    );
  }
  if (!hasLedgerCases(snapshot.data)) notFound();
  return (
    <PublicFrame current="cases" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Closed cases</h1>
      <p className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
        Ideas Aksh has closed and written up. Each shows what he expected, what happened and what he learned, in the words he sealed at the time.
      </p>
      <div className="mt-(--block-gap)">
        <CaseList cases={listCaseSummaries(snapshot.data)} />
      </div>
    </PublicFrame>
  );
}
