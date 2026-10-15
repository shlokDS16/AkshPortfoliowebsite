import { ImageResponse } from "next/og";
import { HOME_CARD, ShareCardImage } from "@/components/desk/share-card";
import { loadOgFonts } from "@/lib/og-fonts";
import { getSnapshot, videoCard } from "@/modules/showcase";

export const alt = "Video share card: the video's title, what it teaches, its length and the date it was revised.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;
// On-demand ISR like the page: without params Next renders the card on every request and ignores revalidate.
export async function generateStaticParams() {
  return [];
}

/** One card per listed video (spec s7.7), regenerated with the page. Snapshot down gives the site card; an unknown or unlisted slug is a 404, like the page. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") return new ImageResponse(<ShareCardImage c={HOME_CARD} />, { ...size, fonts: await loadOgFonts() });
  const card = videoCard(snapshot.data, slug);
  if (!card) return new Response(null, { status: 404 });
  return new ImageResponse(<ShareCardImage c={card} />, { ...size, fonts: await loadOgFonts() });
}
