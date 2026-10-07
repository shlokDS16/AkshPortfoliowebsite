import type { Metadata } from "next";
import { EmptyState } from "@/components/desk/empty-state";
import { PublicFrame } from "@/components/desk/public-frame";
import { buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Mistakes", description: "Where one of Aksh's tests proved his view wrong, listed first." };

/** Spec s7: empty-state copy until Phase 3's ledger (design-dna 13.2, verbatim). */
export default async function MistakesPage() {
  const snapshot = await getSnapshot();
  return (
    <PublicFrame current="mistakes" chrome={snapshot.status === "ok" ? buildSiteChrome(snapshot.data) : null} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Mistakes</h1>
      <div className="mt-(--block-gap) max-w-(--measure)">
        <EmptyState
          title="Nothing here yet."
          body="When one of Aksh's tests proves him wrong, that file and the date are listed here first, next to what he wrote before."
          shape={["File and test", "Date", "Original text"]}
        />
      </div>
    </PublicFrame>
  );
}
