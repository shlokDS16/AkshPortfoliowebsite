import { SITE_POSITION } from "@/components/desk/disclosure";
import { JsonLd } from "@/components/desk/json-ld";
import { PrintDisclosure } from "@/components/desk/print-disclosure";
import { PublicFrame } from "@/components/desk/public-frame";
import { RegisterTable } from "@/components/desk/register-table";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildRegister, buildSiteChrome, getSnapshot, jsonLdFor, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export const metadata = pageMetadata("files", null);

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
      <PrintDisclosure position={SITE_POSITION} reviewedOn={snapshot.data.today} />
      <JsonLd data={jsonLdFor("files", snapshot.data, undefined, publicEnv().NEXT_PUBLIC_SITE_URL)} />
    </PublicFrame>
  );
}
