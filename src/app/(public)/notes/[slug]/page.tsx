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

export async function generateMetadata({ params }: PageProps<"/notes/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  const note = snapshot.status === "ok" ? buildNoteView(snapshot.data, "learning", slug) : null;
  return note ? { title: note.title, description: note.learningObjective } : {};
}

export default async function NotePage({ params }: PageProps<"/notes/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="notes" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Learning note" />
      </PublicFrame>
    );
  }
  const note = buildNoteView(snapshot.data, "learning", slug);
  if (!note) notFound();
  return (
    <PublicFrame current="notes" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <NoteArticle note={note} />
    </PublicFrame>
  );
}
