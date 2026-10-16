import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/desk/json-ld";
import { NoteArticle } from "@/components/desk/note-article";
import { PrintMasthead } from "@/components/desk/print-masthead";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildNoteView, buildSiteChrome, getSnapshot, jsonLdFor, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/process/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  return pageMetadata("processNote", snapshot.status === "ok" ? snapshot.data : null, slug);
}

export default async function ProcessNotePage({ params }: PageProps<"/process/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="process" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Process" />
      </PublicFrame>
    );
  }
  const note = buildNoteView(snapshot.data, "process", slug);
  if (!note) notFound();
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  return (
    <PublicFrame
      current="process"
      chrome={buildSiteChrome(snapshot.data)}
      strip={{ variant: "site" }}
      printMasthead={<PrintMasthead address={`${siteUrl}/process/${note.slug}`} revNo={note.revNo} revisedOn={note.revisedOn} figuresTo={note.dataAsOf} />}
    >
      <NoteArticle note={note} />
      <JsonLd data={jsonLdFor("processNote", snapshot.data, slug, siteUrl)} />
    </PublicFrame>
  );
}
