import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { fileCardContent, HOME_CARD, ShareCardImage } from "@/components/desk/share-card";
import { loadOgFonts } from "@/lib/og-fonts";
import { buildShareCard, getSnapshot } from "@/modules/showcase";

export const alt = "Case file share card: the company, what the file teaches, and the dates it was revised and its figures run to.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;
// On-demand ISR like the page: without params Next renders the card on every request and ignores revalidate.
export async function generateStaticParams() {
  return [];
}

/** One fixed card per file (segment 5), regenerated with the page; retraction purges both (ADR-001 s8.9). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  // Snapshot down: the site card, as the page shows its Unavailable state. Unknown file: 404, like the page.
  if (snapshot.status === "unavailable") return new ImageResponse(<ShareCardImage c={HOME_CARD} />, { ...size, fonts: await loadOgFonts() });
  const card = buildShareCard(snapshot.data, slug);
  if (!card) notFound();
  return new ImageResponse(<ShareCardImage c={fileCardContent(card)} />, { ...size, fonts: await loadOgFonts() });
}
