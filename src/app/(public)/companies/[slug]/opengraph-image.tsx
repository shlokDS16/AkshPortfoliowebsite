import { ImageResponse } from "next/og";
import { fileCardContent, HOME_CARD, ShareCardImage } from "@/components/desk/share-card";
import { loadOgFonts } from "@/lib/og-fonts";
import { buildShareCard, getSnapshot } from "@/modules/showcase";

export const alt = "Case file share card: the company, what the file teaches, and the dates it was revised and its figures run to.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

/** One fixed card per file (segment 5), regenerated with the page; retraction purges both (ADR-001 s8.9). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  const card = snapshot.status === "ok" ? buildShareCard(snapshot.data, slug) : null;
  return new ImageResponse(<ShareCardImage c={card ? fileCardContent(card) : HOME_CARD} />, { ...size, fonts: await loadOgFonts() });
}
