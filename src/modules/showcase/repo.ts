import type { HoldsPosition } from "@/lib/desk-types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { isIsoDate } from "@/modules/casefile";
import { HOLDS_POSITIONS, ITEM_KINDS } from "@/modules/research";
import type { ItemKind, PublicCompanyRow, PublicItemRow, PublicRevisionRow, PublicSnapshot, ShowcaseRepo } from "./types";

// Explicit column lists (rule 9): anon holds column-level grants, and select=* returns 42501 (SDD ledger, Task 3).
export const ITEM_COLUMNS =
  "id, kind, slug, title, company_id, theme_id, published_at, data_as_of, learning_objective, holds_position, revision_id, rev_no, body_md, structured, revised_at, file_no";
export const REVISION_COLUMNS = "id, item_id, rev_no, body_md, structured, change_reason, created_at";
export const COMPANY_COLUMNS = "id, slug, name, nse_symbol, sector";

type Nullable<T> = { [K in keyof T]: T[K] | null };
type ItemRecord = Nullable<{
  id: string; kind: string; slug: string; title: string; company_id: string; theme_id: string; published_at: string; data_as_of: string;
  learning_objective: string; holds_position: string; revision_id: string; rev_no: number; body_md: string; structured: unknown; revised_at: string; file_no: number;
}>;

/** Rule 2: a timestamp must be readable before any view turns it into a date (istDate throws on garbage). */
const isTimestamp = (v: string | null): v is string => v !== null && !Number.isNaN(new Date(v).getTime());
const isKind = (v: string): v is ItemKind => (ITEM_KINDS as readonly string[]).includes(v);
const asPosition = (v: string | null): HoldsPosition | null => ((HOLDS_POSITIONS as readonly string[]).includes(v ?? "") ? (v as HoldsPosition) : null);

function toItem(r: ItemRecord): PublicItemRow[] {
  if (!r.id || !r.slug || !r.title || !r.revision_id || !r.kind || !isKind(r.kind) || !isTimestamp(r.published_at) || !isTimestamp(r.revised_at)) return [];
  return [{
    id: r.id, kind: r.kind, slug: r.slug, title: r.title, companyId: r.company_id, themeId: r.theme_id, publishedAt: r.published_at,
    dataAsOf: isIsoDate(r.data_as_of) ? r.data_as_of : null, learningObjective: r.learning_objective, holdsPosition: asPosition(r.holds_position),
    revisionId: r.revision_id, revNo: r.rev_no ?? 1, bodyMd: r.body_md ?? "", structured: r.structured ?? {}, revisedAt: r.revised_at, fileNo: r.file_no,
  }];
}

export function createSupabaseShowcaseRepo(db: Db): ShowcaseRepo {
  return {
    async listItems() {
      const { data, error } = await db.from("public_items").select(ITEM_COLUMNS).order("published_at", { ascending: true });
      if (error) throw dbError("showcase.listItems", error);
      return ((data ?? []) as unknown as ItemRecord[]).flatMap(toItem);
    },
    async listRevisions() {
      const { data, error } = await db.from("public_item_revisions").select(REVISION_COLUMNS).order("created_at", { ascending: true });
      if (error) throw dbError("showcase.listRevisions", error);
      return (data ?? []).flatMap((r): PublicRevisionRow[] =>
        r.id && r.item_id && isTimestamp(r.created_at)
          ? [{ id: r.id, itemId: r.item_id, revNo: r.rev_no ?? 1, bodyMd: r.body_md ?? "", structured: r.structured ?? {}, changeReason: r.change_reason, createdAt: r.created_at }]
          : [],
      );
    },
    async listCompanies() {
      const { data, error } = await db.from("public_companies").select(COMPANY_COLUMNS).order("name", { ascending: true });
      if (error) throw dbError("showcase.listCompanies", error);
      return (data ?? []).flatMap((c): PublicCompanyRow[] =>
        c.id && c.slug && c.name ? [{ id: c.id, slug: c.slug, name: c.name, symbol: c.nse_symbol, sector: c.sector }] : [],
      );
    },
    async captureDays(days) {
      // capture_days is granted to anon only: this must be the cookie-less public client (rule 10).
      const { data, error } = await db.rpc("capture_days", { p_days: days });
      if (error) throw dbError("showcase.captureDays", error);
      return (data ?? []).map((r: { day: string }) => r.day).filter(isIsoDate);
    },
  };
}

export async function loadSnapshot(repo: ShowcaseRepo, today: string): Promise<PublicSnapshot> {
  const [items, revisions, companies, captureDays] = await Promise.all([repo.listItems(), repo.listRevisions(), repo.listCompanies(), repo.captureDays(30)]);
  return { items, revisions, companies, captureDays, today };
}
