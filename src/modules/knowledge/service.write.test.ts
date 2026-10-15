import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { errorCode, errorText } from "@/lib/messages";
import { addRevision, createItem, ConceptChangePendingError } from "@/modules/research";
import { createMemoryResearchRepo } from "@/test/fakes/research-repo";
import { ConceptNotFoundError, ConceptSelfLinkError } from "./errors";
import { fakeKnowledge, makeConcept } from "./fake-deps";
import { linkConcepts, saveItemConcepts, unlinkConcepts } from "./service";

describe("linkConcepts and unlinkConcepts (his edges)", () => {
  const a = makeConcept({ name: "A" });
  const b = makeConcept({ name: "B" });
  const [lo, hi] = [a.id, b.id].sort() as [string, string];

  it("stores one row with a < b whichever way it was tapped, and a double tap changes nothing", async () => {
    const { deps, world } = fakeKnowledge({ concepts: [a, b] });
    await linkConcepts(deps, b.id, a.id);
    await linkConcepts(deps, a.id, b.id);
    await linkConcepts(deps, hi, lo);
    expect(world.edges).toEqual([{ conceptA: lo, conceptB: hi }]);
    expect(world.edgeCalls.every((c) => c.a === lo && c.b === hi)).toBe(true);
  });

  it("refuses a concept linked to itself, in words, and writes nothing", async () => {
    const { deps, world } = fakeKnowledge({ concepts: [a] });
    const error = await linkConcepts(deps, a.id, a.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConceptSelfLinkError);
    expect(errorText(errorCode(error))).toBe((error as Error).message);
    expect(world.edgeCalls).toEqual([]);
  });

  it("refuses an unknown, archived or unchecked concept, and anything that is not an id", async () => {
    const stub = makeConcept({ name: "Stub", needsReview: true });
    const gone = makeConcept({ name: "Gone" });
    const { deps, world } = fakeKnowledge({ concepts: [a, stub, gone], archived: [gone.id] });
    for (const other of [randomUUID(), stub.id, gone.id]) await expect(linkConcepts(deps, a.id, other)).rejects.toBeInstanceOf(ConceptNotFoundError);
    await expect(linkConcepts(deps, a.id, "nope")).rejects.toBeInstanceOf(InvalidInputError);
    expect(errorText(errorCode(new ConceptNotFoundError()))).toBe(new ConceptNotFoundError().message);
    expect(world.edgeCalls).toEqual([]);
  });

  it("removes the edge whichever way round, and removing it twice is fine", async () => {
    const { deps, world } = fakeKnowledge({ concepts: [a, b], edges: [{ conceptA: lo, conceptB: hi }] });
    await unlinkConcepts(deps, hi, lo);
    await unlinkConcepts(deps, lo, hi);
    expect(world.edges).toEqual([]);
    expect(world.edgeCalls.map((c) => c.op)).toEqual(["delete", "delete"]);
    await expect(unlinkConcepts(deps, "x", lo)).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("saveItemConcepts (his picker; the reason never names a private concept)", () => {
  async function world(visibility: "private" | "public" = "private") {
    const pubConcept = makeConcept({ name: "Open idea", visibility: "public" });
    const secret = makeConcept({ name: "Secret idea" });
    const other = makeConcept({ name: "Other", visibility: "public" });
    const stub = makeConcept({ name: "Stub", needsReview: true });
    const { deps } = fakeKnowledge({ concepts: [pubConcept, secret, other, stub] });
    const repo = createMemoryResearchRepo();
    const { item } = await createItem(repo, { kind: "learning", title: "T", bodyMd: "his words", conceptIds: [pubConcept.id] });
    if (visibility === "public") repo.setVisibility(item.id, "public");
    return { deps: { ...deps, research: repo }, repo, item, pubConcept, secret, other, stub };
  }

  it("saves the picked concepts and names only the public ones in the reason", async () => {
    const w = await world();
    const result = await saveItemConcepts(w.deps, w.item.id, [w.other.id, w.secret.id, w.pubConcept.id]);
    expect(result.revision.conceptIds).toEqual([w.other.id, w.secret.id, w.pubConcept.id]);
    expect(result.revision.changeReason).toBe("Concepts: added Other and 1 other concept.");
    const r2 = await saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id]);
    expect(r2.revision.changeReason).toBe("Concepts: removed Other and 1 other concept.");
    const r3 = await saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id, w.secret.id]);
    expect(r3.revision.changeReason).toBe("Concepts: added 1 other concept.");
    expect(JSON.stringify(w.repo.revisions)).not.toMatch(/Secret idea/);
  });

  it("counts a private concept by number when it is removed too", async () => {
    const w = await world();
    await saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id, w.secret.id]);
    const result = await saveItemConcepts(w.deps, w.item.id, [w.other.id]);
    expect(result.revision.changeReason).toBe("Concepts: added Other; removed Open idea and 1 other concept.");
  });

  it("refuses a concept that is unknown or still unchecked, but lets one he already has stay", async () => {
    const w = await world();
    await expect(saveItemConcepts(w.deps, w.item.id, [randomUUID()])).rejects.toBeInstanceOf(InvalidInputError);
    await expect(saveItemConcepts(w.deps, w.item.id, [w.stub.id])).rejects.toBeInstanceOf(InvalidInputError);
    expect(w.repo.revisions).toHaveLength(1);
  });

  it("keeps an already linked stub and counts it as private when it is dropped", async () => {
    const w = await world();
    // the stub was linked by a capture before it was screened
    await addRevision(w.repo, { itemId: w.item.id, bodyMd: "his words", conceptIds: [w.pubConcept.id, w.stub.id] });
    const kept = await saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id, w.stub.id, w.other.id]);
    expect(kept.revision.changeReason).toBe("Concepts: added Other.");
    const dropped = await saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id, w.other.id]);
    expect(dropped.revision.changeReason).toBe("Concepts: removed 1 other concept.");
  });

  it("on a public item waits for the gate and then refuses a second change", async () => {
    const w = await world("public");
    const first = await saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id, w.other.id]);
    expect(first.pendingGate).toBe(true);
    await expect(saveItemConcepts(w.deps, w.item.id, [w.pubConcept.id])).rejects.toBeInstanceOf(ConceptChangePendingError);
    expect(w.repo.revisions).toHaveLength(2);
  });

  it("is an unknown item when the id is not one", async () => {
    const w = await world();
    await expect(saveItemConcepts(w.deps, randomUUID(), [w.other.id])).rejects.toThrow();
  });
});
