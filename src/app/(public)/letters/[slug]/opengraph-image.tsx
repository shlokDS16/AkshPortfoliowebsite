import { ImageResponse } from "next/og";
import { HOME_CARD, ShareCardImage } from "@/components/desk/share-card";
import { featureOn } from "@/lib/features";
import { loadOgFonts } from "@/lib/og-fonts";
import { getSnapshot, letterCard } from "@/modules/showcase";

export const alt = "Letter share card: the letter's subject, what it teaches and the date it was published.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;
// On-demand ISR like the page: without params Next renders the card on every request and ignores revalidate.
export async function generateStaticParams() {
  return [];
}

/** One card per public letter (spec s8.9), regenerated with the page. Snapshot down gives the site card; an unknown or unpublished slug is a 404, like the page. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Phase 5d (spec s8): a hidden feature has no card, not even the site card a down snapshot would give.
  if (!featureOn("letters")) return new Response(null, { status: 404 });
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") return new ImageResponse(<ShareCardImage c={HOME_CARD} />, { ...size, fonts: await loadOgFonts() });
  const card = letterCard(snapshot.data, slug);
  if (!card) return new Response(null, { status: 404 });
  return new ImageResponse(<ShareCardImage c={card} />, { ...size, fonts: await loadOgFonts() });
}
