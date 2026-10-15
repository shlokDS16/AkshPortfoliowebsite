import { SITE_POSITION } from "@/components/desk/disclosure";
import { JsonLd } from "@/components/desk/json-ld";
import { NoteList } from "@/components/desk/note-list";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildSiteChrome, getSnapshot, jsonLdFor, listNoteSummaries, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata = pageMetadata("notes", null);

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
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.data.today} />
      <JsonLd data={jsonLdFor("notes", snapshot.data, undefined, publicEnv().NEXT_PUBLIC_SITE_URL)} />
    </PublicFrame>
  );
}
