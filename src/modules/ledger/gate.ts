import { addDays, istDate, PUBLICATION_LAG_DAYS } from "@/lib/dates";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// The ledger side of the publish gate (publishing rules 4 and 5; SQL twin in migration 0014). These read for the
// checklist the publish panel shows; the gate itself is `publish_revision()` and is never overridden from here.

/** The four entry kinds that change a stance on a company (open, close, and a resize either way). */
const STANCE_KINDS = ["open", "close", "upsize", "downsize"];

/**
 * The India date from which rule 4 passes, given the time of the latest stance-changing entry on the company; null when
 * there is no such entry or its 30 days are over (rule 4 is clear today). Same rule as the SQL: blocked while
 * `last > today - 30`, counted on the Asia/Kolkata calendar.
 */
export function clearDateFrom(lastStanceAt: string | null, today: string): string | null {
  if (lastStanceAt === null) return null;
  const clear = addDays(istDate(lastStanceAt), PUBLICATION_LAG_DAYS);
  return clear > today ? clear : null;
}

/**
 * The India date from which rule 4 passes for this company, or null when it is clear now. Ideas that were withdrawn
 * do not count. A database failure is thrown: it is never read as "clear".
 */
export async function stanceClearDate(db: Db, companyId: string, today: string = istDate(new Date())): Promise<string | null> {
  const ideas = await db.from("ideas").select("id").eq("company_id", companyId).neq("status", "void");
  if (ideas.error) throw dbError("ledger.stanceClearDate", ideas.error);
  const ids = (ideas.data ?? []).map((row) => row.id);
  if (ids.length === 0) return null;
  const events = await db
    .from("idea_events")
    .select("recorded_at")
    .in("idea_id", ids)
    .in("kind", STANCE_KINDS)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (events.error) throw dbError("ledger.stanceClearDate", events.error);
  return clearDateFrom(events.data?.[0]?.recorded_at ?? null, today);
}

/**
 * True when an open idea on the company is marked as held. A disclosure that says "no position" would contradict it
 * (rule 5, consistency). Not seeing a position is not proof of none: the ledger may be incomplete.
 */
export async function holdsOpenPosition(db: Db, companyId: string): Promise<boolean> {
  const { data, error } = await db.from("ideas").select("id").eq("company_id", companyId).eq("status", "open").eq("held", true).limit(1);
  if (error) throw dbError("ledger.holdsOpenPosition", error);
  return (data ?? []).length > 0;
}
