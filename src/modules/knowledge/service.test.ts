import { describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { fakeKnowledge, linkOf, makeConcept, makeItem } from "./fake-deps";
import { conceptIndex, conceptPage, monthCounts, monthPage } from "./service";

const NOW = new Date("2026-10-20T06:00:00Z");

describe("conceptIndex", () => {
  it("lists screened live concepts by last activity, with status and counts per kind", async () => {
    const rates = makeConcept({ name: "Rates", visibility: "public" });
    const moats = makeConcept({ name: "Moats" });
    const empty = makeConcept({ name: "Alpha" });
    const stub = makeConcept({ name: "Stub", needsReview: true });
    const a = makeItem({ title: "a", kind: "learning", updatedAt: "2026-10-10T00:00:00Z" });
    const b = makeItem({ title: "b", kind: "reading_note", updatedAt: "2026-10-12T00:00:00Z" });
    const c = makeItem({ title: "c", kind: "thesis", updatedAt: "2026-10-09T00:00:00Z" });
    const { deps } = fakeKnowledge({
      concepts: [rates, moats, empty, stub],
      items: [a, b, c],
      links: [linkOf(a, moats), linkOf(b, moats, 2), linkOf(b, rates), linkOf(c, rates), linkOf(a, stub)],
    });
    const rows = await conceptIndex(deps);
    expect(rows.map((r) => r.concept.name)).toEqual(["Moats", "Rates", "Alpha"]);
    expect(rows[0]).toMatchObject({ total: 2, lastActivity: "2026-10-12T00:00:00Z", counts: { learning: 1, read: 1, file: 0, process: 0, note: 0 } });
    expect(rows[1]?.concept).toMatchObject({ status: "public", slug: "rates" });
    expect(rows[2]).toMatchObject({ total: 0, lastActivity: null });
  });

  it("leaves an archived concept out and reads a legacy item through the link view's theme rule", async () => {
    const live = makeConcept({ name: "Live" });
    const gone = makeConcept({ name: "Gone" });
    const legacy = makeItem({ title: "legacy", themeId: live.id });
    const { deps } = fakeKnowledge({ concepts: [live, gone], archived: [gone.id], items: [legacy], links: [linkOf(legacy, live), linkOf(legacy, gone, 2)] });
    const rows = await conceptIndex(deps);
    expect(rows.map((r) => [r.concept.name, r.total])).toEqual([["Live", 1]]);
  });
});

describe("conceptPage", () => {
  const rates = makeConcept({ name: "Rates", descriptionMd: "  what I mean  " });

  it("is null for an unknown or archived slug", async () => {
    const { deps } = fakeKnowledge({ concepts: [rates], archived: [rates.id] });
    expect(await conceptPage(deps, "rates")).toBeNull();
    expect(await conceptPage(deps, "nope")).toBeNull();
  });

  it("gives his description untouched, the items in spec groups newest first, status and his links by name", async () => {
    const zed = makeConcept({ name: "Zed", visibility: "public" });
    const ann = makeConcept({ name: "Ann" });
    const l1 = makeItem({ title: "old learning", kind: "learning", createdAt: "2026-10-01T00:00:00Z" });
    const l2 = makeItem({ title: "new learning", kind: "learning", createdAt: "2026-10-08T00:00:00Z" });
    const file = makeItem({ title: "A file", kind: "case_study", createdAt: "2026-10-03T00:00:00Z" });
    const { deps } = fakeKnowledge({
      concepts: [rates, zed, ann],
      items: [l1, l2, file],
      links: [linkOf(l1, rates), linkOf(l2, rates), linkOf(file, rates)],
      edges: [{ conceptA: [rates.id, zed.id].sort()[0] as string, conceptB: [rates.id, zed.id].sort()[1] as string }, { conceptA: [rates.id, ann.id].sort()[0] as string, conceptB: [rates.id, ann.id].sort()[1] as string }],
    });
    const view = await conceptPage(deps, "rates");
    expect(view?.concept).toMatchObject({ name: "Rates", status: "private", descriptionMd: "  what I mean  " });
    expect(view?.groups.map((g) => [g.group, g.items.map((i) => i.title)])).toEqual([
      ["learning", ["new learning", "old learning"]],
      ["file", ["A file"]],
    ]);
    expect(view?.related.map((r) => [r.name, r.status])).toEqual([
      ["Ann", "private"],
      ["Zed", "public"],
    ]);
  });

  it("shows a stub's page as 'unchecked' and an archived neighbour is not listed", async () => {
    const stub = makeConcept({ name: "Stub", needsReview: true });
    const gone = makeConcept({ name: "Gone" });
    const [x, y] = [stub.id, gone.id].sort() as [string, string];
    const { deps } = fakeKnowledge({ concepts: [stub, gone], archived: [gone.id], edges: [{ conceptA: x, conceptB: y }] });
    const view = await conceptPage(deps, "stub");
    expect(view?.concept.status).toBe("unchecked");
    expect(view?.related).toEqual([]);
  });

  it("suggests concepts that share at least 2 items and are not linked, and never a stub or an archived one", async () => {
    const near = makeConcept({ name: "Near" });
    const linked = makeConcept({ name: "Linked" });
    const stub = makeConcept({ name: "Stubby", needsReview: true });
    const gone = makeConcept({ name: "Gone" });
    const items = [makeItem({ title: "1" }), makeItem({ title: "2" }), makeItem({ title: "3" })];
    const links = items.flatMap((i) => [rates, near, linked, stub, gone].map((c) => linkOf(i, c)));
    const [x, y] = [rates.id, linked.id].sort() as [string, string];
    const { deps } = fakeKnowledge({ concepts: [rates, near, linked, stub, gone], archived: [gone.id], items, links, edges: [{ conceptA: x, conceptB: y }] });
    const view = await conceptPage(deps, "rates");
    expect(view?.suggestions).toEqual([{ concept: expect.objectContaining({ name: "Near" }), shared: 3 }]);
    expect(view?.related.map((r) => r.name)).toEqual(["Linked"]);
  });

  it("returns a title byte for byte as stored", async () => {
    const title = "  Odd “title” — with  spaces \t ";
    const item = makeItem({ title });
    const { deps } = fakeKnowledge({ concepts: [rates], items: [item], links: [linkOf(item, rates)] });
    const view = await conceptPage(deps, "rates");
    expect(view?.groups[0]?.items[0]?.title).toBe(title);
  });
});

describe("monthPage (India months)", () => {
  it("groups learnings under their first live concept by name, 'No concept' last, and lists reads by date", async () => {
    const rates = makeConcept({ name: "Rates" });
    const moats = makeConcept({ name: "Moats" });
    const gone = makeConcept({ name: "Aaa archived" });
    const l1 = makeItem({ title: "rates one", createdAt: "2026-10-10T05:00:00Z" });
    const l2 = makeItem({ title: "moat one", createdAt: "2026-10-04T05:00:00Z" });
    const l3 = makeItem({ title: "loose", createdAt: "2026-10-06T05:00:00Z" });
    const l4 = makeItem({ title: "primary is archived", createdAt: "2026-10-07T05:00:00Z" });
    const r1 = makeItem({ title: "read late", kind: "reading_note", createdAt: "2026-10-20T05:00:00Z" });
    const r2 = makeItem({ title: "read early", kind: "reading_note", createdAt: "2026-10-02T05:00:00Z" });
    const other = makeItem({ title: "a note", kind: "note", createdAt: "2026-10-03T05:00:00Z" });
    const lastMonth = makeItem({ title: "september", createdAt: "2026-09-30T18:29:59Z" });
    const nextMonth = makeItem({ title: "november", createdAt: "2026-10-31T19:00:00Z" });
    const { deps } = fakeKnowledge({
      concepts: [rates, moats, gone],
      archived: [gone.id],
      items: [l1, l2, l3, l4, r1, r2, other, lastMonth, nextMonth],
      links: [linkOf(l1, rates), linkOf(l2, moats), linkOf(l4, gone, 1), linkOf(l4, moats, 2), linkOf(r1, rates)],
    });
    const view = await monthPage(deps, "2026-10", NOW);
    expect(view.learningCount).toBe(4);
    expect(view.readCount).toBe(2);
    expect(view.groups.map((g) => [g.concept?.name ?? null, g.items.map((i) => i.title)])).toEqual([
      ["Moats", ["moat one", "primary is archived"]],
      ["Rates", ["rates one"]],
      [null, ["loose"]],
    ]);
    expect(view.reads.map((r) => r.title)).toEqual(["read early", "read late"]);
  });

  it("uses the lowest position present as the first concept even when position 1 is missing", async () => {
    const a = makeConcept({ name: "Alpha" });
    const b = makeConcept({ name: "Beta" });
    const item = makeItem({ title: "x", createdAt: "2026-10-04T05:00:00Z" });
    const { deps } = fakeKnowledge({ concepts: [a, b], items: [item], links: [linkOf(item, b, 4), linkOf(item, a, 7)] });
    expect((await monthPage(deps, "2026-10", NOW)).groups[0]?.concept?.name).toBe("Beta");
  });

  it("puts a learning under a stub concept too (live, not archived), and reads a legacy item through its link", async () => {
    const stub = makeConcept({ name: "Fresh", needsReview: true });
    const item = makeItem({ title: "legacy", themeId: stub.id, createdAt: "2026-10-04T05:00:00Z" });
    const { deps } = fakeKnowledge({ concepts: [stub], items: [item], links: [linkOf(item, stub)] });
    expect((await monthPage(deps, "2026-10", NOW)).groups.map((g) => g.concept?.name)).toEqual(["Fresh"]);
  });

  it("counts the India month: 19:00Z on the 31st is November's", async () => {
    const edge = makeItem({ title: "edge", createdAt: "2026-10-31T19:00:00Z" });
    const { deps } = fakeKnowledge({ items: [edge] });
    expect((await monthPage(deps, "2026-10", NOW)).learningCount).toBe(0);
    expect((await monthPage(deps, "2026-11", NOW)).learningCount).toBe(1);
  });

  it("is empty for a month with nothing, and names the months either side", async () => {
    const { deps } = fakeKnowledge();
    const view = await monthPage(deps, "2026-08", NOW);
    expect(view).toMatchObject({ month: "2026-08", prevMonth: "2026-07", nextMonth: "2026-09", learningCount: 0, readCount: 0, groups: [], reads: [] });
  });

  it("offers no later month once it reaches the current India month", async () => {
    const { deps } = fakeKnowledge();
    expect((await monthPage(deps, "2026-10", NOW)).nextMonth).toBeNull();
    expect((await monthPage(deps, "2027-03", NOW)).nextMonth).toBeNull();
    expect((await monthPage(deps, "2026-10", new Date("2026-10-31T19:00:00Z"))).nextMonth).toBe("2026-11");
  });

  it("returns every title exactly as stored", async () => {
    const title = "  ‘Quoted’;  trailing   ";
    const item = makeItem({ title, createdAt: "2026-10-04T05:00:00Z" });
    const read = makeItem({ title: `${title}!`, kind: "reading_note", createdAt: "2026-10-04T05:00:00Z" });
    const { deps } = fakeKnowledge({ items: [item, read] });
    const view = await monthPage(deps, "2026-10", NOW);
    expect(view.groups[0]?.items[0]?.title).toBe(title);
    expect(view.reads[0]?.title).toBe(`${title}!`);
  });

  it("refuses a month that is not YYYY-MM", async () => {
    const { deps } = fakeKnowledge();
    await expect(monthPage(deps, "2026-13", NOW)).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("monthCounts", () => {
  it("counts learnings and reads of the India month", async () => {
    const { deps } = fakeKnowledge({
      items: [
        makeItem({ title: "l", createdAt: "2026-10-04T05:00:00Z" }),
        makeItem({ title: "l2", createdAt: "2026-10-05T05:00:00Z" }),
        makeItem({ title: "r", kind: "reading_note", createdAt: "2026-10-06T05:00:00Z" }),
        makeItem({ title: "n", kind: "note", createdAt: "2026-10-06T05:00:00Z" }),
      ],
    });
    expect(await monthCounts(deps, "2026-10")).toEqual({ learnings: 2, reads: 1 });
    expect(await monthCounts(deps, "2026-09")).toEqual({ learnings: 0, reads: 0 });
  });
});
