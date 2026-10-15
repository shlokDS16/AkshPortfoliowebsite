import type { Metadata } from "next";
import { MistakesList } from "@/components/desk/case/mistakes-list";
import { EmptyState } from "@/components/desk/empty-state";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildMistakes, buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Mistakes", description: "Cases in which Aksh judged his own process flawed, or named a kind of mistake." };

/**
 * Addendum s6: the published cases in which HIS review called the process flawed or named a kind of mistake, chosen by his
 * judgement and never by how the share did; no count. The empty state (design-dna 13.2, verbatim) stays until one qualifies.
 */
export default async function MistakesPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="mistakes" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Mistakes" />
      </PublicFrame>
    );
  }
  const entries = buildMistakes(snapshot.data);
  return (
    <PublicFrame current="mistakes" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Mistakes</h1>
      <div className="mt-(--block-gap)">
        {entries.length === 0 ? (
          <div className="max-w-(--measure)">
            <EmptyState
              title="Nothing here yet."
              body="When one of Aksh's tests proves him wrong, that file and the date are listed here first, next to what he wrote before."
              shape={["File and test", "Date", "Original text"]}
            />
          </div>
        ) : (
          <>
            <p className="max-w-(--measure) text-read text-ink-body desk:text-read-desk">
              Closed cases in which Aksh judged his own process flawed, or named a kind of mistake. His judgement lists a case here, not how the share did.
            </p>
            <div className="mt-(--block-gap)">
              <MistakesList entries={entries} />
            </div>
          </>
        )}
      </div>
    </PublicFrame>
  );
}
