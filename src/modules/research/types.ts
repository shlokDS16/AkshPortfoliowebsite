import type { HoldsPosition, ItemKind, ItemStatus, RevisionAuthor, Visibility } from "./schema";

export type Item = {
  id: string;
  kind: ItemKind;
  slug: string | null;
  title: string;
  companyId: string | null;
  themeId: string | null;
  visibility: Visibility;
  status: ItemStatus;
  currentRevisionId: string | null;
  publishedAt: string | null;
  dataAsOf: string | null;
  learningObjective: string | null;
  holdsPosition: HoldsPosition | null;
  createdAt: string;
  updatedAt: string;
};

export type Revision = {
  id: string;
  itemId: string;
  revNo: number;
  bodyMd: string;
  structured: Record<string, unknown>;
  schemaVersion: number;
  changeReason: string | null;
  author: RevisionAuthor;
  createdAt: string;
};

/** revisions: newest first. pending: revisions newer than current (only on public items). */
export type ItemWithHistory = { item: Item; revisions: Revision[]; current: Revision | null; pending: Revision[] };
export type DiffLine = { op: "equal" | "add" | "remove"; text: string };

export type NewItemRow = {
  kind: ItemKind;
  title: string;
  companyId: string | null;
  themeId: string | null;
  learningObjective: string | null;
};
export type NewRevisionRow = {
  itemId: string;
  bodyMd: string;
  structured: Record<string, unknown>;
  changeReason: string | null;
  author: RevisionAuthor;
};
/** No slug (set only inside publish_revision(), ruling R5) and no published_at (DB-stamped). */
export type ItemPatch = Partial<
  Pick<Item, "title" | "kind" | "companyId" | "themeId" | "learningObjective" | "dataAsOf" | "holdsPosition" | "currentRevisionId">
>;

/** Storage port. rev_no is assigned by the database (trigger), never by callers. */
export interface ResearchRepo {
  insertItem(row: NewItemRow): Promise<Item>;
  updateItem(id: string, patch: ItemPatch): Promise<Item>;
  insertRevision(row: NewRevisionRow): Promise<Revision>;
  getItem(id: string): Promise<Item | null>;
  listRevisions(itemId: string): Promise<Revision[]>;
  findThesisForCompany(companyId: string): Promise<Item | null>;
  listRecentItems(limit: number): Promise<Item[]>;
}
