import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/desk/json-ld";
import { LetterArticle } from "@/components/desk/letter-article";
import { PrintMasthead } from "@/components/desk/print-masthead";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildLetterView, buildSiteChrome, getSnapshot, jsonLdFor, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/letters/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  return pageMetadata("letter", snapshot.status === "ok" ? snapshot.data : null, slug);
}

/**
 * Snapshot only (rule 10): a letter is public when it passed the gate (migration 0025) and is the current revision there; anything else is a 404.
 * The page holds his note and his copied entries and the fixed lines; no unsubscribe link, no count of readers and no send time (anon reads none).
 */
export default async function LetterPage({ params }: PageProps<"/letters/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="letters" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Letter" />
      </PublicFrame>
    );
  }
  const letter = buildLetterView(snapshot.data, slug);
  if (!letter) notFound();
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  return (
    <PublicFrame
      current="letters"
      chrome={buildSiteChrome(snapshot.data)}
      strip={{ variant: "site" }}
      printMasthead={<PrintMasthead address={`${siteUrl}/letters/${letter.slug}`} revNo={letter.revNo} revisedOn={letter.revisedOn} figuresTo={null} />}
    >
      <LetterArticle letter={letter} />
      <JsonLd data={jsonLdFor("letter", snapshot.data, slug, siteUrl)} />
    </PublicFrame>
  );
}
