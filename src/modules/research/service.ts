import { z } from "zod";
import { InvalidInputError, ItemNotFoundError, PublicItemLockedError } from "@/lib/errors";
import { isLedgerCase } from "@/modules/casefile/client";
import { conceptChangeReason, dedupeIds, unionConceptIds, type ConceptLabel } from "./concepts";
import { ConceptChangePendingError } from "./errors";
import {
  addRevisionInput,
  appendRevisionInput,
  createItemInput,
  isItemId,
  MAX_CONCEPTS,
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
    conceptIds: data.conceptIds,
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
    conceptIds: data.conceptIds,
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
    // No new concepts: null, so the database carries the links. Otherwise the previous ones first (a legacy null reads as the theme).
    conceptIds:
      data.conceptIds && data.conceptIds.length > 0
        ? unionConceptIds(latest?.conceptIds ?? (history.item.themeId ? [history.item.themeId] : []), data.conceptIds)
        : null,
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

/**
 * The desk's "Save details" form. A case study from the ledger takes its Figures to from the ledger alone (spec s34.5), so whatever the
 * form posts, the stored date stays; moving it is "Refresh from the ledger", which calls updateItemMeta itself.
 */
export async function updateItemDetails(repo: ResearchRepo, itemId: string, patch: UpdateItemMetaInput): Promise<Item> {
  if (!isItemId(itemId)) throw new ItemNotFoundError(itemId);
  const [newest] = await repo.listRevisions(itemId);
  if (newest && isLedgerCase(newest.structured)) {
    const rest = { ...patch };
    delete rest.dataAsOf;
    return updateItemMeta(repo, itemId, rest);
  }
  return updateItemMeta(repo, itemId, patch);
}

export async function listRecentItems(repo: ResearchRepo, limit = 100): Promise<Item[]> {
  return repo.listRecentItems(limit);
}

const conceptList = z.array(z.guid()).max(MAX_CONCEPTS);

/**
 * His concept picker saves here (spec s7): one new revision with the newest body and structured copied as they are, the
 * concepts set, and the change reason from a fixed template filled with `labels` (concept id to its name and whether it is
 * public now; an id with no label is a caller bug). The reason publishes with the revision, so it names only public
 * concepts. A change on a PUBLIC item is refused (ConceptChangePendingError) while a revision already waits for the gate
 * (the reason publishes with that revision); a private item is never refused, even with leftover pending revisions from before it was
 * unpublished, because its reason already names only public concepts. On a private item items.theme_id follows the first concept; on
 * a public item the revision waits for the gate and theme_id stays (it is frozen). The same list, in the same order, writes nothing and returns the
 * newest revision.
 */
export async function setItemConcepts(
  repo: ResearchRepo,
  itemId: string,
  conceptIds: readonly string[],
  labels: Readonly<Record<string, ConceptLabel>>,
): Promise<RevisionResult> {
  const wanted = dedupeIds(conceptList.parse([...conceptIds]));
  const history = await getItemWithHistory(repo, itemId);
  if (!history) throw new ItemNotFoundError(itemId);
  const latest = history.revisions[0];
  if (!latest) throw new ItemNotFoundError(itemId);
  const labelOf = (id: string): ConceptLabel => {
    const label = Object.hasOwn(labels, id) ? labels[id] : undefined;
    if (!label?.name) throw new InvalidInputError();
    return label;
  };
  const before = latest.conceptIds ?? (history.item.themeId ? [history.item.themeId] : []);
  if (before.length === wanted.length && before.every((id, i) => id === wanted[i])) {
    return { item: history.item, revision: latest, pendingGate: history.item.currentRevisionId !== latest.id };
  }
  if (history.item.visibility === "public" && history.pending.length > 0) throw new ConceptChangePendingError();
  const added = wanted.filter((id) => !before.includes(id)).map(labelOf);
  const removed = before.filter((id) => !wanted.includes(id)).map(labelOf);
  const result = await addRevision(repo, {
    itemId,
    bodyMd: latest.bodyMd,
    structured: latest.structured,
    conceptIds: wanted,
    changeReason: conceptChangeReason(added, removed),
    author: "aksh",
  });
  if (result.pendingGate) return result;
  try {
    const synced = await repo.updateItem(itemId, { themeId: wanted[0] ?? null });
    return { ...result, item: synced };
  } catch (error) {
    // Turned public after addRevision: theme_id is frozen now; the revision waits for the gate.
    if (!(error instanceof PublicItemLockedError)) throw error;
    return { ...result, pendingGate: true };
  }
}
