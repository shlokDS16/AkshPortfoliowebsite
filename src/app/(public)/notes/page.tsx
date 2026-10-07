import type { Metadata } from "next";
import { NoteList } from "@/components/desk/note-list";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildSiteChrome, getSnapshot, listNoteSummaries } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Learning notes", description: "Notes on how to read businesses, each listing the files that use it." };

export default async function NotesPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="notes" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Learning notes" />
      </PublicFrame>
    );
  }
  return (
    <PublicFrame current="notes" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="pt-8 text-display text-ink desk:text-display-desk">Learning notes</h1>
      <div className="mt-(--block-gap)">
        <NoteList notes={listNoteSummaries(snapshot.data, "learning")} empty="No learning notes yet. Each note will say what it teaches and which files use it." />
      </div>
    </PublicFrame>
  );
}
