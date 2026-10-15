import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/identity";
import { isItemId } from "@/modules/research";
import { ItemView, type ItemQuery } from "./item-view";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<ItemQuery> };

export default async function ItemPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  if (!isItemId(id)) notFound();
  return ItemView({ id, query });
}
