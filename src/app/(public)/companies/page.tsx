import type { Metadata } from "next";
import { PublicFrame } from "@/components/desk/public-frame";
import { RegisterTable } from "@/components/desk/register-table";
import { Unavailable } from "@/components/desk/unavailable";
import { buildRegister, buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Files", description: "Every public case file: version, last revision, tests and the date its figures run to." };

export default async function FilesPage() {
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="files" chrome={null} strip={{ variant: "site" }}>
        <Unavailable heading="Files" />
      </PublicFrame>
    );
  }
  return (
    <PublicFrame current="files" chrome={buildSiteChrome(snapshot.data)} strip={{ variant: "site" }}>
      <h1 className="sr-only">Files</h1>
      <div className="pt-8">
        <RegisterTable files={buildRegister(snapshot.data)} />
      </div>
    </PublicFrame>
  );
}
