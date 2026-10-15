import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { HOME_CARD, ShareCardImage } from "@/components/desk/share-card";
import { loadOgFonts } from "@/lib/og-fonts";
import { caseCard, getSnapshot } from "@/modules/showcase";

export const alt = "Closed case share card: the company, the case title, what it teaches and its dates. No figure.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;
// On-demand ISR like the page: without params Next renders the card on every request and ignores revalidate.
export async function generateStaticParams() {
  return [];
}

/** One card per published case (spec s4.4); never a figure or the chart (rule 10.7). A 404 until the case is public. Snapshot down gives the site card, as the page shows its Unavailable state; an unknown slug is a 404, like the page. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getSnapshot();
  if (snapshot.status === "unavailable") return new ImageResponse(<ShareCardImage c={HOME_CARD} />, { ...size, fonts: await loadOgFonts() });
  const card = caseCard(snapshot.data, slug);
  if (!card) notFound();
  return new ImageResponse(<ShareCardImage c={card} />, { ...size, fonts: await loadOgFonts() });
}
