import { describe, expect, it } from "vitest";
import { fakeKnowledge, makeConcept } from "./fake-deps";
import { conceptRefs, screenedConceptRefs } from "./service";

describe("screenedConceptRefs", () => {
  it("lists the screened live concepts by name with their status; a stub and an archived one are left out", async () => {
    const rates = makeConcept({ name: "Rates", visibility: "public" });
    const moats = makeConcept({ name: "Moats" });
    const stub = makeConcept({ name: "Stub", needsReview: true });
    const gone = makeConcept({ name: "Gone" });
    const { deps } = fakeKnowledge({ concepts: [rates, moats, stub, gone], archived: [gone.id] });
    expect(await screenedConceptRefs(deps)).toEqual([
      { id: moats.id, slug: "moats", name: "Moats", status: "private" },
      { id: rates.id, slug: "rates", name: "Rates", status: "public" },
    ]);
  });
});

describe("conceptRefs", () => {
  it("answers in the order asked, shows a stub as unchecked and drops an archived or unknown id", async () => {
    const a = makeConcept({ name: "A" });
    const b = makeConcept({ name: "B", needsReview: true });
    const gone = makeConcept({ name: "Gone" });
    const { deps } = fakeKnowledge({ concepts: [a, b, gone], archived: [gone.id] });
    const refs = await conceptRefs(deps, [b.id, gone.id, "00000000-0000-4000-8000-000000000000", a.id]);
    expect(refs.map((r) => [r.name, r.status])).toEqual([["B", "unchecked"], ["A", "private"]]);
  });

  it("asks for nothing when given nothing", async () => {
    const { deps } = fakeKnowledge();
    expect(await conceptRefs(deps, [])).toEqual([]);
  });
});
