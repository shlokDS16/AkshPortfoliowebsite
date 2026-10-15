import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConceptList } from "@/components/desk/concept-list";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildSiteChrome, getSnapshot, listConceptSummaries } from "@/modules/showcase";

export const revalidate = 3600;
const STANDFIRST = "The ideas Aksh uses to read a business, each with the notes and files where it comes up.";
export const metadata: Metadata = { title: "Concepts", description: STANDFIRST };

/** Plan 4 D55: a 404 until a gated revision links a public concept, so merging this changes nothing a visitor can see. No navigation tab. */
export default async function ConceptsPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="concepts" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Concepts" />
      </PublicFrame>
    );
  }
  const concepts = listConceptSummaries(snapshot.data);
  if (concepts.length === 0) notFound();
  return (
    <PublicFrame current="concepts" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Concepts</h1>
      <p data-lint-exclude className="mt-3 max-w-(--measure) text-read text-ink-body desk:text-read-desk">
        {STANDFIRST}
      </p>
      <div className="mt-(--block-gap)">
        <ConceptList concepts={concepts} />
      </div>
    </PublicFrame>
  );
}
