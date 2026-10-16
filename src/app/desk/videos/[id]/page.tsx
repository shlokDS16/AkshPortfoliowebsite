import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/identity";
import { isItemId } from "@/modules/research";
import { ItemView, type ItemQuery } from "../../items/[id]/item-view";
import { videoExtras } from "./extras";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<ItemQuery> };

/** /desk/videos/[id] (spec s7.6): the item page with the video's YouTube, transcript and chapters panels above the editor and rule 12 in the checklist. */
export default async function VideoPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  if (!isItemId(id)) notFound();
  return ItemView({ id, query, video: videoExtras });
}
