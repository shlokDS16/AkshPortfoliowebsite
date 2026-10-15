import { toDeskError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { readAllPages } from "@/lib/supabase/paging";
import type { Db } from "@/lib/supabase/types";
import { ITEM_COLUMNS, toItem } from "./repo";
import type { ItemKind } from "./schema";
import type { Item } from "./types";

// Read-only lookups for the knowledge module's desk read models, on the admin's own client (RLS). Named columns only.

const CHUNK = 100;

/** The items with these ids, in any order. Anything that is not a uuid is dropped; chunked so the request line stays short. */
export async function listItemsByIds(db: Db, ids: readonly string[]): Promise<Item[]> {
  const wanted = [...new Set(ids.filter(isUuid))];
  const out: Item[] = [];
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const { data, error } = await db.from("items").select(ITEM_COLUMNS).in("id", wanted.slice(i, i + CHUNK));
    if (error) throw toDeskError("research.listItemsByIds", error);
    out.push(...data.map(toItem));
  }
  return out;
}

/** Items first written in [fromIso, toIso) (created_at), of these kinds, oldest first. */
export async function listItemsCreatedBetween(db: Db, fromIso: string, toIso: string, kinds: readonly ItemKind[]): Promise<Item[]> {
  if (kinds.length === 0) return [];
  const { data, error } = await readAllPages((from, to) =>
    db
      .from("items")
      .select(ITEM_COLUMNS)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .in("kind", [...kinds])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw toDeskError("research.listItemsCreatedBetween", error);
  return data.map(toItem);
}
