import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { NameNotScreenedError } from "./errors";

export type CompanyBrief = { id: string; name: string; nseSymbol: string | null; visibility: string; needsReview: boolean };

export async function getCompanyBrief(db: Db, id: string): Promise<CompanyBrief | null> {
  const { data, error } = await db.from("companies").select("id, name, nse_symbol, visibility, needs_review").eq("id", id).maybeSingle();
  if (error) throw dbError("catalog.getCompanyBrief", error);
  return data ? { id: data.id, name: data.name, nseSymbol: data.nse_symbol, visibility: data.visibility, needsReview: data.needs_review } : null;
}

/**
 * A company row exposes nothing on its own: public_companies lists it only once a gated item names it. An
 * unscreened or archived stub is refused (NameNotScreenedError); a name must be screened first.
 */
export async function setCompanyPublic(db: Db, id: string): Promise<void> {
  const { data, error } = await db.from("companies").update({ visibility: "public" }).eq("id", id).eq("needs_review", false).is("archived_at", null).select("id");
  if (error) throw dbError("catalog.setCompanyPublic", error);
  if (!data || data.length === 0) throw new NameNotScreenedError();
}
