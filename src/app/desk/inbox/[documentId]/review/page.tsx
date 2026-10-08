import { notFound } from "next/navigation";
import { ReviewOneAtATime } from "@/components/desk/private/review/review-one-at-a-time";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { getReview } from "@/modules/ingestion";

type Props = { params: Promise<{ documentId: string }> };

export default async function ReviewPage({ params }: Props) {
  await requireAdmin();
  const { documentId } = await params;
  if (!isUuid(documentId)) notFound();
  const data = await getReview(await createSupabaseServerClient(), documentId);
  if (!data) notFound();
  return <ReviewOneAtATime data={data} />;
}
