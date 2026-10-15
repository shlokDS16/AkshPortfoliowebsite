import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConceptPage } from "@/components/desk/concept-page";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildConceptView, buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/concepts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  const view = snapshot.status === "ok" ? buildConceptView(snapshot.data, slug) : null;
  return view ? { title: view.name, description: view.standfirst } : {};
}

/** Snapshot only: a concept is public when he made it so and a gated revision of a public item links it (D50); anything else is a 404. */
export default async function ConceptRoute({ params }: PageProps<"/concepts/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="concepts" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Concept" />
      </PublicFrame>
    );
  }
  const view = buildConceptView(snapshot.data, slug);
  if (!view) notFound();
  return (
    <PublicFrame current="concepts" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <ConceptPage view={view} />
    </PublicFrame>
  );
}
