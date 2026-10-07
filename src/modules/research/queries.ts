import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// Read-only lookups for job code (E5). Explicit columns only: the secret-key role holds exactly these (migration 0007),
// never body_md, change_reason or visibility, so Aksh's words stay out of the machine's reach.

/**
 * The company's newest thesis or case study that is not archived, with the structured data of its newest revision,
 * or null when it has none. The machine reads it to know which labels Aksh already tracks.
 */
export async function latestFileForCompany(db: Db, companyId: string): Promise<{ itemId: string; title: string; structured: unknown } | null> {
  const item = await db
    .from("items")
    .select("id, title")
    .eq("company_id", companyId)
    .in("kind", ["thesis", "case_study"])
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (item.error) throw jobDbError("research.latestFile", item.error);
  if (!item.data) return null;
  const revision = await db
    .from("item_revisions")
    .select("structured")
    .eq("item_id", item.data.id)
    .order("rev_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revision.error) throw jobDbError("research.latestFileRevision", revision.error);
  if (!revision.data) return null;
  return { itemId: item.data.id, title: item.data.title, structured: revision.data.structured };
}
