import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { errorText } from "@/lib/messages";
import { createSupabaseResearchRepo, ITEM_KINDS, listRecentItems } from "@/modules/research";
import { createItemAction } from "@/modules/research/actions";

// A read is what he logs with r: (spec s6); the desk says "read", the database says reading_note.
const kindWord = (kind: string) => (kind === "reading_note" ? "read" : kind.replace("_", " "));

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ error?: string; kind?: string }> }) {
  await requireAdmin();
  const { error, kind } = await searchParams;
  const reads = kind === "reading_note";
  const errorMessage = errorText(error);
  const recent = await listRecentItems(createSupabaseResearchRepo(await createSupabaseServerClient()));
  const items = reads ? recent.filter((i) => i.kind === "reading_note") : recent;
  const link = "inline-flex min-h-11 items-center underline decoration-1 underline-offset-3";
  return (
    <div className="space-y-6">
      <h1 className="text-title text-ink desk:text-title-desk">Items</h1>
      <nav aria-label="Concepts, the month and videos" className="flex flex-wrap gap-x-5 text-small">
        <Link href="/desk/concepts" className={link}>
          Concepts
        </Link>
        <Link href="/desk/learned" className={link}>
          This month
        </Link>
        <Link href="/desk/videos" className={link}>
          Videos
        </Link>
      </nav>
      <form action={createItemAction} className="flex flex-wrap items-end gap-2 rounded-sm border border-rule p-3">
        <div className="space-y-1">
          <Label htmlFor="kind">Kind</Label>
          <select id="kind" name="kind" defaultValue="note" className="block min-h-11 rounded-sm border border-input bg-paper px-2 text-body text-ink">
            {/* A video is filed from its link (v: in the capture box), which also creates its YouTube row; a bare item of this kind would have none. */}
            {ITEM_KINDS.filter((kind) => kind !== "video").map((kind) => (
              <option key={kind} value={kind}>
                {kind.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <Button type="submit">Create item</Button>
      </form>
      <nav aria-label="Show items" className="flex gap-x-5 text-small">
        <Link href="/desk/items" aria-current={reads ? undefined : "page"} className={`${link} ${reads ? "" : "font-semibold"}`}>
          All
        </Link>
        <Link href="/desk/items?kind=reading_note" aria-current={reads ? "page" : undefined} className={`${link} ${reads ? "font-semibold" : ""}`}>
          Reads
        </Link>
      </nav>
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-small text-ink-muted">{reads ? "No reads yet. A line starting with r: logs one." : "No items yet. Create the first one above."}</p>
      ) : null}
      <ul className="divide-y divide-rule text-body">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 py-(--row-y)">
            <Link href={`/desk/items/${item.id}`} className="underline decoration-1 underline-offset-3">
              {item.title}
            </Link>
            <span className="text-small text-ink-muted">
              {kindWord(item.kind)} · {item.visibility}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
