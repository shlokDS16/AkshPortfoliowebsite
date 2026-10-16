import { SITE_POSITION } from "@/components/desk/disclosure";
import { JsonLd } from "@/components/desk/json-ld";
import { MistakesList } from "@/components/desk/case/mistakes-list";
import { MistakesEmpty } from "@/components/desk/case/mistakes-empty";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildMistakes, buildSiteChrome, getSnapshot, jsonLdFor, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata = pageMetadata("mistakes", null);

/**
 * Addendum s6: the published cases in which HIS review called the process flawed or named a kind of mistake, chosen by his
 * judgement and never by how the share did; no count. The empty state stays until one qualifies (its copy changed from design-dna 13.2, spec s34).
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
            <MistakesEmpty />
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
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.data.today} />
      <JsonLd data={jsonLdFor("mistakes", snapshot.data, undefined, publicEnv().NEXT_PUBLIC_SITE_URL)} />
    </PublicFrame>
  );
}
