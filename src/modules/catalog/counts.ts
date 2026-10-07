import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

/** Stub companies and themes created by unknown $SYM / #theme captures, waiting on the New names screen. */
export async function countNamesToReview(db: Db): Promise<number> {
  const [companies, themes] = await Promise.all([
    db.from("companies").select("id", { count: "exact", head: true }).eq("needs_review", true).is("archived_at", null),
    db.from("themes").select("id", { count: "exact", head: true }).eq("needs_review", true).is("archived_at", null),
  ]);
  if (companies.error) throw dbError("catalog.countCompanies", companies.error);
  if (themes.error) throw dbError("catalog.countThemes", themes.error);
  return (companies.count ?? 0) + (themes.count ?? 0);
}
