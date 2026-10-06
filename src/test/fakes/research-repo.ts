import { randomUUID } from "node:crypto";
import { PublicItemLockedError } from "@/modules/research";
import type { Item, ItemPatch, ResearchRepo, Revision, Visibility } from "@/modules/research";

export type MemoryResearchRepo = ResearchRepo & {
  items: Map<string, Item>;
  revisions: Revision[];
  setVisibility(id: string, visibility: Visibility): void;
};

/** The columns private.guard_publish_columns() freezes while an item is public. */
const FROZEN_WHILE_PUBLIC: (keyof ItemPatch)[] = [
  "title",
  "kind",
  "companyId",
  "themeId",
  "learningObjective",
  "dataAsOf",
  "holdsPosition",
  "currentRevisionId",
];

/** In-memory ResearchRepo that also mirrors the SQL guard, so a service bug cannot hide behind the fake. */
export function createMemoryResearchRepo(): MemoryResearchRepo {
  const items = new Map<string, Item>();
  const revisions: Revision[] = [];
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 4, 0, 0, tick++)).toISOString();

  return {
    items,
    revisions,
    setVisibility(id, visibility) {
      const item = items.get(id);
      if (!item) throw new Error(`no item ${id}`);
      items.set(id, { ...item, visibility, status: visibility === "public" ? "published" : item.status });
    },
    async insertItem(row) {
      const ts = now();
      const item: Item = {
        id: randomUUID(),
        kind: row.kind,
        slug: null,
        title: row.title,
        companyId: row.companyId,
        themeId: row.themeId,
        visibility: "private",
        status: "draft",
        currentRevisionId: null,
        publishedAt: null,
        dataAsOf: null,
        learningObjective: row.learningObjective,
        holdsPosition: null,
        createdAt: ts,
        updatedAt: ts,
      };
      items.set(item.id, item);
      return item;
    },
    async updateItem(id, patch) {
      const item = items.get(id);
      if (!item) throw new Error(`no item ${id}`);
      if (item.visibility === "public") {
        const changes = FROZEN_WHILE_PUBLIC.filter((key) => key in patch && patch[key] !== item[key]);
        if (changes.length > 0) throw new PublicItemLockedError(id);
      }
      const next = { ...item, ...patch, updatedAt: now() };
      items.set(id, next);
      return next;
    },
    async insertRevision(row) {
      if (!items.has(row.itemId)) throw new Error(`no item ${row.itemId}`);
      const revision: Revision = {
        id: randomUUID(),
        itemId: row.itemId,
        revNo: revisions.filter((r) => r.itemId === row.itemId).length + 1,
        bodyMd: row.bodyMd,
        structured: row.structured,
        schemaVersion: 1,
        changeReason: row.changeReason,
        author: row.author,
        createdAt: now(),
      };
      revisions.push(revision);
      return revision;
    },
    async getItem(id) {
      return items.get(id) ?? null;
    },
    async listRevisions(itemId) {
      return revisions.filter((r) => r.itemId === itemId).sort((a, b) => b.revNo - a.revNo);
    },
    async findThesisForCompany(companyId) {
      const theses = [...items.values()]
        .filter((i) => i.kind === "thesis" && i.companyId === companyId && i.status !== "archived")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return theses[0] ?? null;
    },
    async listRecentItems(limit) {
      return [...items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
    },
  };
}
