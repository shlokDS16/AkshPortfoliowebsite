import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/identity";
import { isItemId } from "@/modules/research";
import { LetterView } from "./letter-view";
import { loadLetterPage } from "./load";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> };

/** /desk/letters/[id] (spec s8.1). Admin only: requireAdmin runs first, and every action on the page checks it again on the server. */
export default async function LetterPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  if (!isItemId(id)) notFound();
  const page = await loadLetterPage(id);
  if (!page) notFound();
  return <LetterView page={page} query={query} />;
}
