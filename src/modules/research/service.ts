import { ItemNotFoundError, PublicItemLockedError } from "@/lib/errors";
import {
  addRevisionInput,
  appendRevisionInput,
  createItemInput,
  isItemId,
  updateItemMetaInput,
  type AddRevisionInput,
  type AppendRevisionInput,
  type CreateItemInput,
  type UpdateItemMetaInput,
} from "./schema";
import type { Item, ItemWithHistory, ResearchRepo, Revision } from "./types";

type RevisionResult = { item: Item; revision: Revision; pendingGate: boolean };

/** New items are private drafts (publishing-rules: default private). */
export async function createItem(repo: ResearchRepo, input: CreateItemInput): Promise<{ item: Item; revision: Revision }> {
  const data = createItemInput.parse(input);
  const draft = await repo.insertItem({
    kind: data.kind,
    title: data.title,
    companyId: data.companyId,
    themeId: data.themeId,
    learningObjective: data.learningObjective,
  });
  const revision = await repo.insertRevision({
    itemId: draft.id,
    bodyMd: data.bodyMd,
    structured: data.structured,
    changeReason: "created",
    author: data.author,
  });
  const item = await repo.updateItem(draft.id, { currentRevisionId: revision.id });
  return { item, revision };
}

/**
 * Revisions are append-only. On a public item the new revision is stored but never made
 * current here: only the SQL publish_revision() can advance current_revision_id, so the
 * result says pendingGate and the desk screen shows it as waiting for the gate.
 */
export async function addRevision(repo: ResearchRepo, input: AddRevisionInput): Promise<RevisionResult> {
  const data = addRevisionInput.parse(input);
  const existing = await repo.getItem(data.itemId);
  if (!existing) throw new ItemNotFoundError(data.itemId);
  const revision = await repo.insertRevision({
    itemId: existing.id,
    bodyMd: data.bodyMd,
    structured: data.structured,
    changeReason: data.changeReason,
    author: data.author,
  });
  if (existing.visibility === "public") return { item: existing, revision, pendingGate: true };
  try {
    const item = await repo.updateItem(existing.id, { currentRevisionId: revision.id });
    return { item, revision, pendingGate: false };
  } catch (error) {
    // The item became public between the read and the write: the SQL guard refused. The
    // revision is stored; it waits for the gate like any other on a public item.
    if (!(error instanceof PublicItemLockedError)) throw error;
    return { item: (await repo.getItem(existing.id)) ?? existing, revision, pendingGate: true };
  }
}

/** Appends text to the latest revision (decision D7: a capture adds to a thesis, never replaces it). */
export async function appendRevision(repo: ResearchRepo, input: AppendRevisionInput): Promise<RevisionResult> {
  const data = appendRevisionInput.parse(input);
  const history = await getItemWithHistory(repo, data.itemId);
  if (!history) throw new ItemNotFoundError(data.itemId);
  const latest = history.revisions[0] ?? null;
  const base = latest ? latest.bodyMd.trimEnd() : "";
  return addRevision(repo, {
    itemId: data.itemId,
    bodyMd: base === "" ? data.appendMd : `${base}\n\n${data.appendMd}`,
    structured: latest?.structured ?? {},
    changeReason: data.changeReason,
    author: data.author,
  });
}

export async function getItemWithHistory(repo: ResearchRepo, itemId: string): Promise<ItemWithHistory | null> {
  if (!isItemId(itemId)) return null;
  const item = await repo.getItem(itemId);
  if (!item) return null;
  const revisions = await repo.listRevisions(itemId);
  const current = revisions.find((r) => r.id === item.currentRevisionId) ?? null;
  const pending = current ? revisions.filter((r) => r.revNo > current.revNo) : [];
  return { item, revisions, current, pending };
}

/** Details of a public item are frozen (decision D10); the DB guard enforces the same rule. */
export async function updateItemMeta(repo: ResearchRepo, itemId: string, patch: UpdateItemMetaInput): Promise<Item> {
  const data = updateItemMetaInput.parse(patch);
  if (!isItemId(itemId)) throw new ItemNotFoundError(itemId);
  const existing = await repo.getItem(itemId);
  if (!existing) throw new ItemNotFoundError(itemId);
  if (existing.visibility === "public") throw new PublicItemLockedError(itemId);
  return repo.updateItem(itemId, data);
}

export async function listRecentItems(repo: ResearchRepo, limit = 100): Promise<Item[]> {
  return repo.listRecentItems(limit);
}
