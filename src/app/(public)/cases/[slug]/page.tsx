import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CasePage } from "@/components/desk/case/case-page";
import { JsonLd } from "@/components/desk/json-ld";
import { PrintMasthead } from "@/components/desk/print-masthead";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildCaseStudyView, buildSiteChrome, getSnapshot, jsonLdFor, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/cases/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  return pageMetadata("case", snapshot.status === "ok" ? snapshot.data : null, slug);
}

/** A closed idea from the ledger (Plan 3b, spec s33). Reads only the cached public snapshot: the current published revision. */
export default async function CaseRoute({ params }: PageProps<"/cases/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="cases" chrome={null} strip={{ variant: "site" }} topBar="file" back={{ href: "/cases", label: "Cases" }}>
        <Unavailable heading="Closed case" />
      </PublicFrame>
    );
  }
  const view = buildCaseStudyView(snapshot.data, slug);
  if (!view) notFound();
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  return (
    <PublicFrame
      current="cases"
      chrome={buildSiteChrome(snapshot.data)}
      strip={{ variant: "file", holdsPosition: view.holdsPosition, dataAsOf: view.dateline.figuresTo }}
      topBar="file"
      back={{ href: "/cases", label: "Cases" }}
      printMasthead={<PrintMasthead address={`${siteUrl}/cases/${view.slug}`} revNo={view.revNo} revisedOn={view.reviewedOn} figuresTo={view.dateline.figuresTo} />}
    >
      <CasePage view={view} />
      <JsonLd data={jsonLdFor("case", snapshot.data, slug, siteUrl)} />
    </PublicFrame>
  );
}
