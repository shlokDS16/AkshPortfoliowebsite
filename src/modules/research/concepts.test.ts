import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InvalidInputError, ItemNotFoundError } from "@/lib/errors";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { conceptChangeReason, unionConceptIds } from "./concepts";
import { addRevision, appendRevision, createItem, setItemConcepts } from "./service";

const [A, B, C, D] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const names = { [A]: "A", [B]: "B", [C]: "C", [D]: "D" };

describe("conceptChangeReason (the fixed template, his act)", () => {
  it("names what was added, what was removed, or both", () => {
    expect(conceptChangeReason(["A", "B"], [])).toBe("Concepts: added A, B.");
    expect(conceptChangeReason([], ["C"])).toBe("Concepts: removed C.");
    expect(conceptChangeReason(["A", "B"], ["C"])).toBe("Concepts: added A, B; removed C.");
  });

  it("says the order changed when the set did not", () => {
    expect(conceptChangeReason([], [])).toBe("Concepts: order changed.");
  });

  it("falls back to counts when the names would pass the 300-unit reason limit", () => {
    const long = "N".repeat(120);
    expect(conceptChangeReason([long, long, long], ["C"])).toBe("Concepts: added 3; removed 1.");
  });
});

describe("unionConceptIds", () => {
  it("keeps the previous ids first, adds new ones, drops repeats and stops at 8", () => {
    expect(unionConceptIds([A], [C])).toEqual([A, C]);
    expect(unionConceptIds([A, B], [B, C])).toEqual([A, B, C]);
    const many = Array.from({ length: 8 }, () => randomUUID());
    expect(unionConceptIds(many, [A])).toEqual(many);
  });
});

describe("createItem and addRevision carry conceptIds", () => {
  it("files the explicit array on the first revision", async () => {
    const repo = createMemoryResearchRepo();
    const insert = vi.spyOn(repo, "insertRevision");
    const { revision } = await createItem(repo, { kind: "note", title: "T", conceptIds: [A, B] });
    expect(insert.mock.calls[0][0].conceptIds).toEqual([A, B]);
    expect(revision.conceptIds).toEqual([A, B]);
  });

  it("passes null (carry) when no ids are given, and the store carries the previous ones", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", conceptIds: [A, B] });
    const insert = vi.spyOn(repo, "insertRevision");
    const { revision } = await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    expect(insert.mock.calls[0][0].conceptIds).toBeNull();
    expect(revision.conceptIds).toEqual([A, B]);
  });
});

describe("appendRevision with conceptIds (a capture adds to a thesis)", () => {
  it("writes previous then new ids", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "T", bodyMd: "v1", conceptIds: [A] });
    const { revision } = await appendRevision(repo, { itemId: item.id, appendMd: "more", conceptIds: [C] });
    expect(revision.conceptIds).toEqual([A, C]);
  });

  it("writes null when the capture has no tag", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "T", bodyMd: "v1", conceptIds: [A] });
    const insert = vi.spyOn(repo, "insertRevision");
    await appendRevision(repo, { itemId: item.id, appendMd: "more" });
    expect(insert.mock.calls[0][0].conceptIds).toBeNull();
  });

  it("reads a legacy revision (null links) as its theme", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "thesis", title: "T", bodyMd: "v1", themeId: A });
    repo.revisions[0].conceptIds = null;
    const { revision } = await appendRevision(repo, { itemId: item.id, appendMd: "more", conceptIds: [C] });
    expect(revision.conceptIds).toEqual([A, C]);
  });
});

describe("setItemConcepts (spec s7)", () => {
  it("makes one revision with the same body and structured, and the template reason", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "his words", structured: { k: 1 }, conceptIds: [A, C] });
    const { revision } = await setItemConcepts(repo, item.id, [A, B, D], names);
    expect(repo.revisions.filter((r) => r.itemId === item.id)).toHaveLength(2);
    expect(revision).toMatchObject({
      revNo: 2,
      bodyMd: "his words",
      structured: { k: 1 },
      conceptIds: [A, B, D],
      changeReason: "Concepts: added B, D; removed C.",
      author: "aksh",
    });
  });

  it("uses the removed-only and added-only parts", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", conceptIds: [A, C] });
    expect((await setItemConcepts(repo, item.id, [A], names)).revision.changeReason).toBe("Concepts: removed C.");
    expect((await setItemConcepts(repo, item.id, [A, B], names)).revision.changeReason).toBe("Concepts: added B.");
  });

  it("builds on the newest body, and an empty list clears every link", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", bodyMd: "v1", conceptIds: [A] });
    await addRevision(repo, { itemId: item.id, bodyMd: "v2" });
    const { revision } = await setItemConcepts(repo, item.id, [], names);
    expect(revision).toMatchObject({ bodyMd: "v2", conceptIds: [] });
  });

  it("syncs theme_id to the first concept on a private item", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", themeId: A, conceptIds: [A] });
    const result = await setItemConcepts(repo, item.id, [B, A], names);
    expect(result.pendingGate).toBe(false);
    expect(repo.items.get(item.id)?.themeId).toBe(B);
    expect(repo.items.get(item.id)?.currentRevisionId).toBe(result.revision.id);
    await setItemConcepts(repo, item.id, [], names);
    expect(repo.items.get(item.id)?.themeId).toBeNull();
  });

  it("on a public item writes the pending revision and leaves theme_id and the current revision alone", async () => {
    const repo = createMemoryResearchRepo();
    const { item, revision: first } = await createItem(repo, { kind: "learning", title: "T", themeId: A, conceptIds: [A] });
    repo.setVisibility(item.id, "public");
    const result = await setItemConcepts(repo, item.id, [B], names);
    expect(result.pendingGate).toBe(true);
    expect(result.revision.conceptIds).toEqual([B]);
    expect(repo.items.get(item.id)).toMatchObject({ themeId: A, currentRevisionId: first.id });
  });

  it("writes nothing when the list is the same, in the same order", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", conceptIds: [A, B] });
    const result = await setItemConcepts(repo, item.id, [A, B], names);
    expect(result.revision.revNo).toBe(1);
    expect(repo.revisions).toHaveLength(1);
  });

  it("a different order alone is a new revision (the first is the primary concept)", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T", conceptIds: [A, B] });
    const { revision } = await setItemConcepts(repo, item.id, [B, A], names);
    expect(revision).toMatchObject({ revNo: 2, conceptIds: [B, A], changeReason: "Concepts: order changed." });
  });

  it("drops repeats and refuses more than 8, an unknown item and a missing name", async () => {
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "note", title: "T" });
    expect((await setItemConcepts(repo, item.id, [A, A, B], names)).revision.conceptIds).toEqual([A, B]);
    await expect(setItemConcepts(repo, item.id, Array.from({ length: 9 }, () => randomUUID()), {})).rejects.toThrow();
    await expect(setItemConcepts(repo, randomUUID(), [A], names)).rejects.toBeInstanceOf(ItemNotFoundError);
    await expect(setItemConcepts(repo, item.id, [randomUUID()], names)).rejects.toBeInstanceOf(InvalidInputError);
  });
});
