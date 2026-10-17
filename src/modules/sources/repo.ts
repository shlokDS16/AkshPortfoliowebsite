import { isRecord } from "@/lib/records";
import type { Tables } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { sourceDbError } from "./errors";
import { PROBLEM_CODES, type NewSource, type ProblemCode, type SourceFilter, type SourceRecord } from "./types";

// The desk's reads and writes of saved links, on the admin's cookie session (RLS applies: the admin selects all three tables, inserts a
// link, and updates only its note and its archive switch; the machine columns are written by the server's read and nothing else,
// migration 0026). The join rows are read with plain queries, not embedded selects, so one filter works the same way everywhere.

const COLUMNS =
  "id, url, kind, youtube_id, note, created_at, archived_at, title, site_name, channel_url, thumb_path, thumb_sha256, meta_sha, meta_since, fetched_at, checked_at, gone, fetch_problem, fetch_attempts";
const LIST_LIMIT = 1000;
const CHUNK = 100;

type Row = Pick<
  Tables<"source_links">,
  | "id" | "url" | "kind" | "youtube_id" | "note" | "created_at" | "archived_at" | "title" | "site_name" | "channel_url" | "thumb_path" | "thumb_sha256"
  | "meta_sha" | "meta_since" | "fetched_at" | "checked_at" | "gone" | "fetch_problem" | "fetch_attempts"
>;

const asProblem = (value: string | null): ProblemCode | null => PROBLEM_CODES.find((code) => code === value) ?? null;

function toRecord(row: Row, companyIds: string[], themeIds: string[]): SourceRecord {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind === "youtube" ? "youtube" : "web",
    youtubeId: row.youtube_id,
    note: row.note,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    title: row.title,
    siteName: row.site_name,
    channelUrl: row.channel_url,
    thumbPath: row.thumb_path,
    thumbSha256: row.thumb_sha256,
    metaSha: row.meta_sha,
    metaSince: row.meta_since,
    fetchedAt: row.fetched_at,
    checkedAt: row.checked_at,
    gone: row.gone,
    fetchProblem: asProblem(row.fetch_problem),
    fetchAttempts: row.fetch_attempts,
    companyIds,
    themeIds,
  };
}

const chunks = <T>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

export interface SourcesRepo {
  findByKey(urlKey: string): Promise<SourceRecord | null>;
  get(id: string): Promise<SourceRecord | null>;
  /** Newest first. Archived links are left out unless the filter asks. */
  list(filter?: SourceFilter): Promise<SourceRecord[]>;
  insert(source: NewSource): Promise<SourceRecord>;
  setNote(id: string, note: string): Promise<void>;
  /** `null` restores the link. Refused (SourceError) while the current public revision of a file shows it. */
  setArchived(id: string, at: string | null): Promise<void>;
  /** Adds one company; one already attached is not an error. */
  addCompany(id: string, companyId: string): Promise<void>;
  /** Removes one company. Refused (SourceError) while the company's public file shows the link. */
  removeCompany(id: string, companyId: string): Promise<void>;
  addConcept(id: string, themeId: string): Promise<void>;
  removeConcept(id: string, themeId: string): Promise<void>;
  /** The links listed by the current revision of a public thesis or company case study, with the item that lists each. */
  publicLinks(): Promise<Map<string, string[]>>;
}

export function createSupabaseSourcesRepo(db: Db): SourcesRepo {
  async function joins(ids: readonly string[]): Promise<{ companies: Map<string, string[]>; themes: Map<string, string[]> }> {
    const companies = new Map<string, string[]>();
    const themes = new Map<string, string[]>();
    for (const part of chunks(ids)) {
      const [c, t] = await Promise.all([
        db.from("source_link_companies").select("link_id, company_id").in("link_id", part),
        db.from("source_link_concepts").select("link_id, theme_id").in("link_id", part),
      ]);
      if (c.error) throw dbError("sources.companies", c.error);
      if (t.error) throw dbError("sources.concepts", t.error);
      for (const r of c.data ?? []) companies.set(r.link_id, [...(companies.get(r.link_id) ?? []), r.company_id]);
      for (const r of t.data ?? []) themes.set(r.link_id, [...(themes.get(r.link_id) ?? []), r.theme_id]);
    }
    return { companies, themes };
  }

  async function records(rows: readonly Row[]): Promise<SourceRecord[]> {
    const { companies, themes } = await joins(rows.map((r) => r.id));
    return rows.map((r) => toRecord(r, companies.get(r.id) ?? [], themes.get(r.id) ?? []));
  }

  async function one(column: "id" | "url_key", value: string): Promise<SourceRecord | null> {
    const { data, error } = await db.from("source_links").select(COLUMNS).eq(column, value).maybeSingle();
    if (error) throw dbError("sources.get", error);
    return data ? (await records([data]))[0] : null;
  }

  /** The ids a company or a concept is attached to, or null for "no such filter". */
  async function attachedTo(filter: SourceFilter): Promise<string[] | null> {
    let ids: string[] | null = null;
    const narrow = (found: string[]) => (ids = ids === null ? found : ids.filter((id) => found.includes(id)));
    if (filter.companyId) {
      const { data, error } = await db.from("source_link_companies").select("link_id").eq("company_id", filter.companyId);
      if (error) throw dbError("sources.byCompany", error);
      narrow((data ?? []).map((r) => r.link_id));
    }
    if (filter.themeId) {
      const { data, error } = await db.from("source_link_concepts").select("link_id").eq("theme_id", filter.themeId);
      if (error) throw dbError("sources.byConcept", error);
      narrow((data ?? []).map((r) => r.link_id));
    }
    return ids;
  }

  return {
    findByKey: (urlKey) => one("url_key", urlKey),
    get: (id) => one("id", id),
    async list(filter = {}) {
      const ids = await attachedTo(filter);
      if (ids !== null && ids.length === 0) return [];
      const rows: Row[] = [];
      for (const part of ids === null ? [null] : chunks(ids)) {
        let query = db.from("source_links").select(COLUMNS);
        if (part !== null) query = query.in("id", part);
        if (!filter.includeArchived) query = query.is("archived_at", null);
        const { data, error } = await query.order("created_at", { ascending: false }).limit(LIST_LIMIT);
        if (error) throw dbError("sources.list", error);
        rows.push(...(data ?? []));
      }
      return records(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async insert(source) {
      const { data, error } = await db
        .from("source_links")
        .insert({ url: source.url, url_key: source.urlKey, kind: source.kind, youtube_id: source.youtubeId, note: source.note })
        .select(COLUMNS)
        .single();
      if (error) throw dbError("sources.insert", error);
      return toRecord(data, [], []);
    },
    async setNote(id, note) {
      const { error } = await db.from("source_links").update({ note }).eq("id", id);
      if (error) throw sourceDbError("sources.setNote", error);
    },
    async setArchived(id, at) {
      const { error } = await db.from("source_links").update({ archived_at: at }).eq("id", id);
      if (error) throw sourceDbError("sources.setArchived", error);
    },
    async addCompany(id, companyId) {
      const { error } = await db.from("source_link_companies").insert({ link_id: id, company_id: companyId });
      if (error && error.code !== "23505") throw sourceDbError("sources.addCompany", error);
    },
    async removeCompany(id, companyId) {
      const { error } = await db.from("source_link_companies").delete().eq("link_id", id).eq("company_id", companyId);
      if (error) throw sourceDbError("sources.removeCompany", error);
    },
    async addConcept(id, themeId) {
      const { error } = await db.from("source_link_concepts").insert({ link_id: id, theme_id: themeId });
      if (error && error.code !== "23505") throw sourceDbError("sources.addConcept", error);
    },
    async removeConcept(id, themeId) {
      const { error } = await db.from("source_link_concepts").delete().eq("link_id", id).eq("theme_id", themeId);
      if (error) throw sourceDbError("sources.removeConcept", error);
    },
    async publicLinks() {
      const items = await db
        .from("items")
        .select("id, current_revision_id")
        .eq("visibility", "public")
        .eq("status", "published")
        .in("kind", ["thesis", "case_study"])
        .limit(LIST_LIMIT);
      if (items.error) throw dbError("sources.publicItems", items.error);
      const itemOf = new Map((items.data ?? []).flatMap((i) => (i.current_revision_id ? [[i.current_revision_id, i.id] as const] : [])));
      const out = new Map<string, string[]>();
      for (const part of chunks([...itemOf.keys()])) {
        const { data, error } = await db.from("item_revisions").select("id, structured").in("id", part);
        if (error) throw dbError("sources.publicRevisions", error);
        for (const rev of data ?? []) {
          const studied = isRecord(rev.structured) && Array.isArray(rev.structured.studied) ? rev.structured.studied : [];
          for (const entry of studied) {
            if (isRecord(entry) && typeof entry.link === "string") out.set(entry.link, [...(out.get(entry.link) ?? []), itemOf.get(rev.id) ?? ""]);
          }
        }
      }
      return out;
    },
  };
}
