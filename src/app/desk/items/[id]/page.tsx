import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseResearchRepo, getItemWithHistory, isItemId, noticeText } from "@/modules/research";
import { History } from "./history";
import { MetaForm } from "./meta-form";
import { RevisionForm } from "./revision-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; from?: string; to?: string }>;
};

export default async function ItemPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { error, notice, from, to } = await searchParams;
  if (!isItemId(id)) notFound();
  const history = await getItemWithHistory(createSupabaseResearchRepo(await createSupabaseServerClient()), id);
  if (!history) notFound();
  const { item, revisions, current, pending } = history;
  const isPublic = item.visibility === "public";
  const noticeMessage = noticeText(notice);
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{item.title}</h1>
        <p className="text-sm text-muted-foreground">
          {item.kind.replace("_", " ")} · <span data-testid="visibility">{isPublic ? "Public" : "Private"}</span>
          {current ? ` · current revision #${current.revNo}` : ""}
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {noticeMessage ? (
        <p role="status" className="rounded border px-3 py-2 text-sm">
          {noticeMessage}
        </p>
      ) : null}
      {pending.length > 0 ? (
        <p data-testid="pending-gate" className="rounded border border-amber-600 px-3 py-2 text-sm">
          {pending.length} {pending.length === 1 ? "revision is" : "revisions are"} waiting for the publishing gate. The public page still
          shows revision #{current?.revNo}.
        </p>
      ) : null}
      <MetaForm item={item} />
      <RevisionForm itemId={item.id} latest={revisions[0] ?? null} isPublic={isPublic} />
      <History
        revisions={revisions}
        currentId={current?.id ?? null}
        pendingIds={new Set(pending.map((r) => r.id))}
        from={from}
        to={to}
      />
    </article>
  );
}
