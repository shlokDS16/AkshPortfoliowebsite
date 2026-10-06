import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { createSupabaseResearchRepo, errorText, ITEM_KINDS, listRecentItems } from "@/modules/research";
import { createItemAction } from "@/modules/research/actions";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  const errorMessage = errorText(error);
  const items = await listRecentItems(createSupabaseResearchRepo(await createSupabaseServerClient()));
  return (
    <div className="space-y-6">
      <form action={createItemAction} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <div className="space-y-1">
          <Label htmlFor="kind">Kind</Label>
          <select id="kind" name="kind" defaultValue="note" className="h-9 rounded-md border bg-transparent px-2 text-sm">
            {ITEM_KINDS.map((kind) => (
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
      {errorMessage ? (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No items yet. Create the first one above.</p> : null}
      <ul className="divide-y text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 py-2">
            <Link href={`/desk/items/${item.id}`} className="underline">
              {item.title}
            </Link>
            <span className="text-muted-foreground">
              {item.kind.replace("_", " ")} · {item.visibility}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
