import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileHeader } from "@/components/desk/file-header";
import { FileSections } from "@/components/desk/file-sections";
import { JsonLd } from "@/components/desk/json-ld";
import { PhoneIndex } from "@/components/desk/phone-index";
import { PrintMasthead } from "@/components/desk/print-masthead";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { publicEnv } from "@/lib/env";
import { buildFileView, buildSiteChrome, getSnapshot, jsonLdFor, pageMetadata } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/companies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  return pageMetadata("file", snapshot.status === "ok" ? snapshot.data : null, slug);
}

/** The B+ company file (segment 1). Reads only the cached public snapshot (Task 9). */
export default async function FilePage({ params }: PageProps<"/companies/[slug]">) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") {
    return (
      <PublicFrame current="files" chrome={null} strip={{ variant: "site" }} topBar="file">
        <Unavailable heading="Case file" />
      </PublicFrame>
    );
  }
  const file = buildFileView(snapshot.data, slug);
  if (!file) notFound();
  const siteUrl = publicEnv().NEXT_PUBLIC_SITE_URL;
  return (
    <PublicFrame
      current="files"
      chrome={buildSiteChrome(snapshot.data)}
      strip={{ variant: "file", holdsPosition: file.holdsPosition, dataAsOf: file.dataAsOf }}
      topBar="file"
      file={{ fileNo: file.fileNo, shortName: file.company, sections: [...file.sections, { id: "disclosure", label: "Disclosure" }] }}
      printMasthead={<PrintMasthead address={`${siteUrl}/companies/${file.companySlug}`} revNo={file.revNo} revisedOn={file.dateline.revisedOn} figuresTo={file.dataAsOf} />}
    >
      <div className="-mx-(--gutter) desk:mx-0">
        <PhoneIndex sections={file.sections} />
      </div>
      <FileHeader file={file} />
      <FileSections file={file} />
      <JsonLd data={jsonLdFor("file", snapshot.data, slug, siteUrl)} />
    </PublicFrame>
  );
}
