import type { Metadata } from "next";
import { RecordKeeping } from "@/components/desk/case/record-keeping";
import { NoteList } from "@/components/desk/note-list";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { PUBLIC_FINGERPRINT_FILE } from "@/modules/casefile/client";
import { buildSiteChrome, getSnapshot, hasLedgerCases, listNoteSummaries } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Process", description: "How the desk works: how a file is kept, tested and revised." };

export default async function ProcessPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="process" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Process" />
      </PublicFrame>
    );
  }
  return (
    <PublicFrame current="process" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Process</h1>
      <div className="mt-(--block-gap)">
        <NoteList notes={listNoteSummaries(snapshot.data, "process")} empty="No process notes yet. Each will explain one part of how the files are kept." />
      </div>
      {/* Plan 3b D37: absent until one ledger case study is public, so a deploy changes nothing a visitor can see. */}
      {hasLedgerCases(snapshot.data) ? <RecordKeeping publicFile={PUBLIC_FINGERPRINT_FILE} /> : null}
    </PublicFrame>
  );
}
