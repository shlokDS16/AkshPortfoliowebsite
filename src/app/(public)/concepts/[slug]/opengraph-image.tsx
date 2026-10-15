import { ImageResponse } from "next/og";
import { HOME_CARD, ShareCardImage } from "@/components/desk/share-card";
import { loadOgFonts } from "@/lib/og-fonts";
import { conceptCard, getSnapshot } from "@/modules/showcase";

export const alt = "Concept share card: the concept's name, a sentence about it and how many notes and files use it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;
// On-demand ISR like the page: without params Next renders the card on every request and ignores revalidate.
export async function generateStaticParams() {
  return [];
}

/** One card per public concept (spec s4.4). A 404 until a public item uses it. Snapshot down gives the site card, as the page shows its Unavailable state; an unknown slug is a 404, like the page. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") return new ImageResponse(<ShareCardImage c={HOME_CARD} />, { ...size, fonts: await loadOgFonts() });
  const card = conceptCard(snapshot.data, slug);
  if (!card) return new Response(null, { status: 404 });
  return new ImageResponse(<ShareCardImage c={card} />, { ...size, fonts: await loadOgFonts() });
}
