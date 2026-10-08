import { notFound } from "next/navigation";
import { ReviewOneAtATime } from "@/components/desk/private/review/review-one-at-a-time";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { getReview, listCompanyOptions } from "@/modules/ingestion";

type Props = { params: Promise<{ documentId: string }> };

export default async function ReviewPage({ params }: Props) {
  await requireAdmin();
  const { documentId } = await params;
  if (!isUuid(documentId)) notFound();
  const db = await createSupabaseServerClient();
  const data = await getReview(db, documentId);
  if (!data) notFound();
  // Only a document uploaded without a company needs the list: it has to be linked before its figures can be filed.
  const companies = data.document.companyId ? [] : await listCompanyOptions(db);
  return <ReviewOneAtATime data={data} companies={companies} />;
}
