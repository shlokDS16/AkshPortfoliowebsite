import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteArticle } from "@/components/desk/note-article";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildNoteView, buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/process/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  const note = snapshot.status === "ok" ? buildNoteView(snapshot.data, "process", slug) : null;
  return note ? { title: note.title, description: note.learningObjective } : {};
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
  return (
    <PublicFrame current="process" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <NoteArticle note={note} />
    </PublicFrame>
  );
}
