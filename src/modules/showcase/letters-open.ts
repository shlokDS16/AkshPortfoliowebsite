import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

/**
 * Plan 5c (spec s8.9): `letters_open()` (migration 0024; anon may execute it): sign-ups are switched on AND fewer than 950 readers are confirmed.
 * A yes or a no and nothing else about readers. A failed read throws (with the operation and code only, never the database's words), so a cache
 * never keeps a "closed" that was really an outage.
 */
export async function readLettersOpen(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc("letters_open");
  if (error) throw jobDbError("showcase.lettersOpen", error);
  return data === true;
}
