import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileHeader } from "@/components/desk/file-header";
import { FileSections } from "@/components/desk/file-sections";
import { PhoneIndex } from "@/components/desk/phone-index";
import { PublicFrame } from "@/components/desk/public-frame";
import { Unavailable } from "@/components/desk/unavailable";
import { buildFileView, buildSiteChrome, getSnapshot } from "@/modules/showcase";

export const revalidate = 3600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/companies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  const file = snapshot.status === "ok" ? buildFileView(snapshot.data, slug) : null;
  return file ? { title: `${file.company} · File ${file.fileNo}`, description: file.learningObjective } : {};
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
  return (
    <PublicFrame
      current="files"
      chrome={buildSiteChrome(snapshot.data)}
      strip={{ variant: "file", holdsPosition: file.holdsPosition, dataAsOf: file.dataAsOf }}
      topBar="file"
      file={{ fileNo: file.fileNo, shortName: file.company, sections: [...file.sections, { id: "disclosure", label: "Disclosure" }] }}
    >
      <div className="-mx-(--gutter) desk:mx-0">
        <PhoneIndex sections={file.sections} />
      </div>
      <FileHeader file={file} />
      <FileSections file={file} />
    </PublicFrame>
  );
}
