import { randomUUID } from "node:crypto";
import { DbError } from "@/lib/supabase/errors";
import { SourceError } from "@/modules/sources/errors";
import type { SourcesRepo } from "@/modules/sources/repo";
import type { NewSource, SourceRecord } from "@/modules/sources/types";

// An in-memory SourcesRepo for the service, capture and action tests. It keeps the database's rules the service relies on: one link per
// key (a second insert is a unique violation), at most 5 companies and 8 concepts, and no archive or company removal while a public file
// lists the link (`publicOn` marks a link as listed).

export type MemorySourcesRepo = SourcesRepo & {
  records: Map<string, SourceRecord>;
  /** link id -> company ids of the public files that list it. */
  publicOn: Map<string, string[]>;
  /** Every write, in order, as "op id". */
  log: string[];
};

export function createMemorySourcesRepo(now: () => string = () => new Date().toISOString()): MemorySourcesRepo {
  const records = new Map<string, SourceRecord>();
  const keys = new Map<string, string>();
  const publicOn = new Map<string, string[]>();
  const log: string[] = [];
  const need = (id: string) => {
    const r = records.get(id);
    if (!r) throw new Error("no such source");
    return r;
  };
  return {
    records,
    publicOn,
    log,
    async findByKey(key) {
      const id = keys.get(key);
      return id ? structuredClone(need(id)) : null;
    },
    async get(id) {
      const r = records.get(id);
      return r ? structuredClone(r) : null;
    },
    async list(filter = {}) {
      return [...records.values()]
        .filter((r) => (filter.includeArchived || r.archivedAt === null) && (!filter.companyId || r.companyIds.includes(filter.companyId)) && (!filter.themeId || r.themeIds.includes(filter.themeId)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => structuredClone(r));
    },
    async insert(source: NewSource) {
      if (keys.has(source.urlKey)) throw new DbError("sources.insert", "23505", "duplicate key");
      const record: SourceRecord = {
        id: randomUUID(), url: source.url, kind: source.kind, youtubeId: source.youtubeId, note: source.note, createdAt: now(), archivedAt: null,
        title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, metaSha: null, metaSince: null, fetchedAt: null, checkedAt: null,
        gone: false, fetchProblem: null, fetchAttempts: 0, companyIds: [], themeIds: [],
      };
      records.set(record.id, record);
      keys.set(source.urlKey, record.id);
      log.push(`insert ${record.id}`);
      return structuredClone(record);
    },
    async setNote(id, note) {
      need(id).note = note;
      log.push(`note ${id}`);
    },
    async setArchived(id, at) {
      if (at !== null && publicOn.has(id)) throw new SourceError("source-on-public-file");
      need(id).archivedAt = at;
      log.push(`archive ${id} ${at === null ? "restore" : "set"}`);
    },
    async addCompany(id, companyId) {
      const r = need(id);
      if (r.companyIds.includes(companyId)) return;
      if (r.companyIds.length >= 5) throw new SourceError("source-too-many-companies");
      r.companyIds.push(companyId);
      log.push(`company+ ${id}`);
    },
    async removeCompany(id, companyId) {
      if (publicOn.get(id)?.includes(companyId)) throw new SourceError("source-on-public-file");
      const r = need(id);
      r.companyIds = r.companyIds.filter((c) => c !== companyId);
      log.push(`company- ${id}`);
    },
    async addConcept(id, themeId) {
      const r = need(id);
      if (r.themeIds.includes(themeId)) return;
      if (r.themeIds.length >= 8) throw new SourceError("source-too-many-concepts");
      r.themeIds.push(themeId);
      log.push(`concept+ ${id}`);
    },
    async removeConcept(id, themeId) {
      const r = need(id);
      r.themeIds = r.themeIds.filter((t) => t !== themeId);
      log.push(`concept- ${id}`);
    },
    async publicLinks() {
      return new Map([...publicOn.keys()].map((id) => [id, ["item"]]));
    },
  };
}
