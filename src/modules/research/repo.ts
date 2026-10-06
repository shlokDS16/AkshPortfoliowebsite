import type { Json, Tables, TablesUpdate } from "@/lib/supabase/database.types";
import { toDeskError } from "@/lib/errors";
import { asRecord } from "@/lib/records";
import type { Db } from "@/lib/supabase/types";
import type { HoldsPosition, ItemKind, ItemStatus, RevisionAuthor, Visibility } from "./schema";
import type { Item, ItemPatch, ResearchRepo, Revision } from "./types";

// Named columns only: the generated search tsvector is never selected, and column grants
// would reject a '*' for roles that lack a column.
const ITEM_COLUMNS =
  "id, kind, slug, title, company_id, theme_id, visibility, status, current_revision_id, published_at, data_as_of, learning_objective, holds_position, created_at, updated_at";
const REVISION_COLUMNS = "id, item_id, rev_no, body_md, structured, schema_version, change_reason, author, created_at";

type ItemRow = Omit<Tables<"items">, "search">;
type RevisionRow = Tables<"item_revisions">;

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    kind: row.kind as ItemKind,
    slug: row.slug,
    title: row.title,
    companyId: row.company_id,
    themeId: row.theme_id,
    visibility: row.visibility as Visibility,
    status: row.status as ItemStatus,
    currentRevisionId: row.current_revision_id,
    publishedAt: row.published_at,
    dataAsOf: row.data_as_of,
    learningObjective: row.learning_objective,
    holdsPosition: row.holds_position as HoldsPosition | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRevision(row: RevisionRow): Revision {
  return {
    id: row.id,
    itemId: row.item_id,
    revNo: row.rev_no,
    bodyMd: row.body_md,
    structured: asRecord(row.structured) ?? {},
    schemaVersion: row.schema_version,
    changeReason: row.change_reason,
    author: row.author as RevisionAuthor,
    createdAt: row.created_at,
  };
}

/** No slug and no published_at: only publish_revision() writes them (ruling R5). */
function toItemUpdate(patch: ItemPatch): TablesUpdate<"items"> {
  const out: TablesUpdate<"items"> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.kind !== undefined) out.kind = patch.kind;
  if (patch.companyId !== undefined) out.company_id = patch.companyId;
  if (patch.themeId !== undefined) out.theme_id = patch.themeId;
  if (patch.learningObjective !== undefined) out.learning_objective = patch.learningObjective;
  if (patch.dataAsOf !== undefined) out.data_as_of = patch.dataAsOf;
  if (patch.holdsPosition !== undefined) out.holds_position = patch.holdsPosition;
  if (patch.currentRevisionId !== undefined) out.current_revision_id = patch.currentRevisionId;
  return out;
}

export function createSupabaseResearchRepo(db: Db): ResearchRepo {
  return {
    async insertItem(row) {
      const { data, error } = await db
        .from("items")
        .insert({
          kind: row.kind,
          title: row.title,
          company_id: row.companyId,
          theme_id: row.themeId,
          learning_objective: row.learningObjective,
        })
        .select(ITEM_COLUMNS)
        .single();
      if (error) throw toDeskError("research.insertItem", error);
      return toItem(data);
    },
    async updateItem(id, patch) {
      const { data, error } = await db.from("items").update(toItemUpdate(patch)).eq("id", id).select(ITEM_COLUMNS).single();
      if (error) throw toDeskError("research.updateItem", error, id);
      return toItem(data);
    },
    async insertRevision(row) {
      const { data, error } = await db
        .from("item_revisions")
        .insert({
          item_id: row.itemId,
          body_md: row.bodyMd,
          structured: row.structured as { [key: string]: Json | undefined },
          change_reason: row.changeReason,
          author: row.author,
        })
        .select(REVISION_COLUMNS)
        .single();
      if (error) throw toDeskError("research.insertRevision", error, row.itemId);
      return toRevision(data);
    },
    async getItem(id) {
      const { data, error } = await db.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw toDeskError("research.getItem", error, id);
      return data ? toItem(data) : null;
    },
    async listRevisions(itemId) {
      const { data, error } = await db
        .from("item_revisions")
        .select(REVISION_COLUMNS)
        .eq("item_id", itemId)
        .order("rev_no", { ascending: false });
      if (error) throw toDeskError("research.listRevisions", error, itemId);
      return data.map(toRevision);
    },
    async findThesisForCompany(companyId) {
      const { data, error } = await db
        .from("items")
        .select(ITEM_COLUMNS)
        .eq("kind", "thesis")
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw toDeskError("research.findThesisForCompany", error);
      return data ? toItem(data) : null;
    },
    async listRecentItems(limit) {
      const { data, error } = await db
        .from("items")
        .select(ITEM_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw toDeskError("research.listRecentItems", error);
      return data.map(toItem);
    },
  };
}
