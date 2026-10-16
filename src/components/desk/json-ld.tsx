import { serializeJsonLd } from "@/modules/showcase";

/** One structured-data script for a page, from `jsonLdFor`. It renders nothing for a page that has none, and adds no client code. */
export function JsonLd({ data }: { data: object[] }) {
  if (data.length === 0) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
