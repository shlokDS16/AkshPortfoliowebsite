import Link from "next/link";
import { ConceptList } from "@/components/desk/private/concepts/concept-list";
import { errorText, noticeText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { conceptIndex, createSupabaseKnowledgeDeps } from "@/modules/knowledge";

export default async function ConceptsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const { error, notice } = await searchParams;
  const rows = await conceptIndex(createSupabaseKnowledgeDeps(await createSupabaseServerClient()));
  const errorMessage = errorText(error);
  const noticeMessage = noticeText(notice);
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="text-title text-ink desk:text-title-desk">Concepts</h1>
      <p className="max-w-[72ch] text-small text-ink-muted">Every #name you write becomes a concept. Its page gathers your notes on it.</p>
      <nav aria-label="Concept pages" className="flex flex-wrap gap-x-5 text-small">
        <Link href="/desk/items" className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-3">
          Items
        </Link>
        <Link href="/desk/learned" className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-3">
          This month
        </Link>
      </nav>
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      {noticeMessage ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {noticeMessage}
        </p>
      ) : null}
      <ConceptList rows={rows} />
    </div>
  );
}
