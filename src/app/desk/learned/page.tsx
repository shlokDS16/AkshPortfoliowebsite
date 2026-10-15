import { MonthPage } from "@/components/desk/private/concepts/month-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseKnowledgeDeps, monthPage } from "@/modules/knowledge";
import { isMonth, monthOf } from "@/modules/knowledge/client";

/** `?m=YYYY-MM`; anything else (or nothing) is this month in India. */
export default async function LearnedPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireAdmin();
  const { m } = await searchParams;
  const now = new Date();
  const month = isMonth(m) ? m : monthOf(now.toISOString());
  const view = await monthPage(createSupabaseKnowledgeDeps(await createSupabaseServerClient()), month, now);
  return <MonthPage view={view} />;
}
