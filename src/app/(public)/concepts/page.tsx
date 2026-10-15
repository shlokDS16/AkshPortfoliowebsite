import { notFound } from "next/navigation";
import { ConceptList } from "@/components/desk/concept-list";
import { SITE_POSITION } from "@/components/desk/disclosure";
import { JsonLd } from "@/components/desk/json-ld";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildSiteChrome, CONCEPTS_STANDFIRST, getSnapshot, jsonLdFor, listConceptSummaries, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata = pageMetadata("concepts", null);

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
        {CONCEPTS_STANDFIRST}
      </p>
      <div className="mt-(--block-gap)">
        <ConceptList concepts={concepts} />
      </div>
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.data.today} />
      <JsonLd data={jsonLdFor("concepts", snapshot.data, undefined, publicEnv().NEXT_PUBLIC_SITE_URL)} />
    </PublicFrame>
  );
}
