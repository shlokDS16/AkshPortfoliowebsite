import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// What a saved source can be attached to (Phase 5d): every live company and concept, a stub included (a capture's $NEWCO makes one before Names
// screens it). Names, slugs and the symbol only; a concept's description is his private text and is never read here.
export type AttachableCompany = { id: string; slug: string; name: string; symbol: string | null };
export type AttachableConcept = { id: string; slug: string; name: string };
const LIMIT = 1000;

export async function listAttachables(db: Db): Promise<{ companies: AttachableCompany[]; concepts: AttachableConcept[] }> {
  const [companies, themes] = await Promise.all([
    db.from("companies").select("id, slug, name, nse_symbol").is("archived_at", null).order("name", { ascending: true }).limit(LIMIT),
    db.from("themes").select("id, slug, name").is("archived_at", null).order("name", { ascending: true }).limit(LIMIT),
  ]);
  if (companies.error) throw dbError("catalog.attachableCompanies", companies.error);
  if (themes.error) throw dbError("catalog.attachableConcepts", themes.error);
  return {
    companies: (companies.data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name, symbol: c.nse_symbol })),
    concepts: (themes.data ?? []).map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
  };
}
