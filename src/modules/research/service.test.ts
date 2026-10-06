import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { ItemNotFoundError, PublicItemLockedError } from "@/lib/errors";
import { addRevision, appendRevision, createItem, getItemWithHistory, updateItemMeta } from "./service";

describe("createItem", () => {
  it("creates a private draft whose first revision is current", async () => {
    const repo = createMemoryResearchRepo();
    const { item, revision } = await createItem(repo, { kind: "learning", title: "  How capex cycles turn ", bodyMd: "v1" });
    expect(item).toMatchObject({
      title: "How capex cycles turn",
      visibility: "private",
      status: "draft",
      currentRevisionId: revision.id,
    });
    expect(revision).toMatchObject({ revNo: 1, bodyMd: "v1", changeReason: "created", author: "aksh" });
  });

  it("rejects an empty title", async () => {
    await expect(createItem(createMemoryResearchRepo(), { kind: "note", title: "   " })).rejects.toThrow(/Title is required/);
  });
});

describe("addRevision", () => {
  it("advances the current revision of a private item", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", bodyMd: "v1" });
    const result = await addRevision(repo, { itemId: item.id, bodyMd: "v2", changeReason: "sharper" });
    expect(result.pendingGate).toBe(false);
    expect(result.revision.revNo).toBe(2);
    expect(result.item.currentRevisionId).toBe(result.revision.id);
  });

  it("stores a revision on a public item but leaves it waiting for the gate", async () => {
    const repo = createMemoryResearchRepo();
    const { item, revision: first } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    const result = await addRevision(repo, { itemId: item.id, bodyMd: "v2", changeReason: "update" });
    expect(result.pendingGate).toBe(true);
    expect(result.revision.revNo).toBe(2);
    expect(repo.items.get(item.id)?.currentRevisionId).toBe(first.id);
  });

  it("never touches current_revision_id of a public item (the fake mirrors the SQL guard)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    const update = vi.spyOn(repo, "updateItem");
    await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports waiting-for-the-gate when the item turned public after it was read", async () => {
    const repo = createMemoryResearchRepo();
    const { item, revision: first } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    const stale = { ...item };
    repo.setVisibility(item.id, "public");
    vi.spyOn(repo, "getItem").mockResolvedValueOnce(stale);
    const result = await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    expect(result.pendingGate).toBe(true);
    expect(result.revision.revNo).toBe(2);
    expect(repo.items.get(item.id)?.currentRevisionId).toBe(first.id);
  });

  it("throws for an unknown item", async () => {
    await expect(addRevision(createMemoryResearchRepo(), { itemId: randomUUID(), bodyMd: "x" })).rejects.toBeInstanceOf(
      ItemNotFoundError,
    );
  });
});

describe("appendRevision", () => {
  it("appends to the latest body after a blank line (decision D7)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "TCS thesis", bodyMd: "v1\n" });
    const { revision } = await appendRevision(repo, { itemId: item.id, appendMd: "Deal wins slowing", changeReason: "Deal wins slowing" });
    expect(revision.bodyMd).toBe("v1\n\nDeal wins slowing");
    expect(revision.changeReason).toBe("Deal wins slowing");
  });

  it("uses the new text alone when the latest body is empty", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "T" });
    const { revision } = await appendRevision(repo, { itemId: item.id, appendMd: "first line" });
    expect(revision.bodyMd).toBe("first line");
  });

  it("builds on the newest revision even when it is still waiting for the gate", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    const result = await appendRevision(repo, { itemId: item.id, appendMd: "more" });
    expect(result.revision.bodyMd).toBe("v2\n\nmore");
    expect(result.pendingGate).toBe(true);
  });
});

describe("getItemWithHistory", () => {
  it("lists revisions newest first and separates revisions waiting for the gate", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "v1" });
    repo.setVisibility(item.id, "public");
    await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    await addRevision(repo, { itemId: item.id, bodyMd: "v3" });
    const history = await getItemWithHistory(repo, item.id);
    expect(history?.revisions.map((r) => r.revNo)).toEqual([3, 2, 1]);
    expect(history?.current?.revNo).toBe(1);
    expect(history?.pending.map((r) => r.revNo)).toEqual([3, 2]);
  });

  it("returns null for an unknown item", async () => {
    await expect(getItemWithHistory(createMemoryResearchRepo(), randomUUID())).resolves.toBeNull();
  });

  it("returns null for a malformed id without asking the repo", async () => {
    const repo = createMemoryResearchRepo();
    const get = vi.spyOn(repo, "getItem");
    await expect(getItemWithHistory(repo, "not-a-uuid")).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("updateItemMeta", () => {
  it("updates the details of a private item", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    const updated = await updateItemMeta(repo, item.id, {
      learningObjective: "Recognise a capex peak.",
      dataAsOf: "2026-08-01",
      holdsPosition: "no",
    });
    expect(updated).toMatchObject({ learningObjective: "Recognise a capex peak.", dataAsOf: "2026-08-01", holdsPosition: "no" });
  });

  it("clears a detail when the patch sets it to null", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", learningObjective: "Spot a peak." });
    const updated = await updateItemMeta(repo, item.id, { learningObjective: null });
    expect(updated.learningObjective).toBeNull();
  });

  it("refuses to change a public item (decision D10)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    repo.setVisibility(item.id, "public");
    await expect(updateItemMeta(repo, item.id, { title: "New" })).rejects.toBeInstanceOf(PublicItemLockedError);
  });

  it("does not let the slug be edited (ruling R5: only publish_revision sets it)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    await expect(updateItemMeta(repo, item.id, { slug: "capex-peak" } as never)).rejects.toThrow(/slug/i);
    expect(repo.items.get(item.id)?.slug).toBeNull();
  });

  it("rejects a malformed date with a plain message", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T" });
    await expect(updateItemMeta(repo, item.id, { dataAsOf: "01/08/2026" })).rejects.toThrow(/valid date/);
  });

  it("throws not-found for an unknown or malformed id", async () => {
    const repo = createMemoryResearchRepo();
    await expect(updateItemMeta(repo, randomUUID(), { title: "x" })).rejects.toBeInstanceOf(ItemNotFoundError);
    await expect(updateItemMeta(repo, "nope", { title: "x" })).rejects.toBeInstanceOf(ItemNotFoundError);
  });
});
