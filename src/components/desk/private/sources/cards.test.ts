import { describe, expect, it } from "vitest";
import type { SourceRecord } from "@/modules/sources/client";
import { buildCards, companyOptions, conceptOptions, readFilters } from "./cards";

const companies = [{ id: "c1", slug: "kavpump", name: "Kaveri Pumps", symbol: "KAVPUMP" }, { id: "c2", slug: "newco", name: "New Co", symbol: null }];
const concepts = [{ id: "t1", slug: "moats", name: "Moats" }];
const record = (id: string, over: Partial<SourceRecord> = {}): SourceRecord => ({
  id, url: "https://youtu.be/abcdefghijk", kind: "youtube", youtubeId: "abcdefghijk", note: "", createdAt: "2026-10-03T05:00:00Z", archivedAt: null, title: null, siteName: null, channelUrl: null,
  thumbPath: null, thumbSha256: null, metaSha: null, metaSince: null, fetchedAt: null, checkedAt: null, gone: false, fetchProblem: null, fetchAttempts: 0, companyIds: [], themeIds: [], ...over,
});

describe("the sources page's view model", () => {
  it("turns ids into names, in the order attached, and drops an id the lists no longer hold", () => {
    const [card] = buildCards({ records: [record("s1", { companyIds: ["c2", "c1", "gone"], themeIds: ["t1", "zzz"] })], companies, concepts, publicLinks: new Map(), itemTitles: new Map() });
    expect(card!.companies.map((c) => c.slug)).toEqual(["newco", "kavpump"]);
    expect(card!.companies[1]).toMatchObject({ id: "c1", label: "Kaveri Pumps", hint: "KAVPUMP" });
    expect(card!.concepts.map((c) => c.slug)).toEqual(["moats"]);
  });

  it("lists the public files that show the link, by title, once each", () => {
    const [on, off] = buildCards({
      records: [record("s1"), record("s2")], companies, concepts,
      publicLinks: new Map([["s1", ["i1", "i1", "i2"]]]), itemTitles: new Map([["i1", "Kaveri Pumps: pricing power"], ["i2", "Another file"]]),
    });
    expect(on!.publicFiles).toEqual([{ itemId: "i1", title: "Kaveri Pumps: pricing power" }, { itemId: "i2", title: "Another file" }]);
    expect(off!.publicFiles).toEqual([]);
  });

  it("falls back to a plain word for a file whose title cannot be read, never to its id", () => {
    const [card] = buildCards({ records: [record("s1")], companies, concepts, publicLinks: new Map([["s1", ["i9"]]]), itemTitles: new Map() });
    expect(card!.publicFiles).toEqual([{ itemId: "i9", title: "the public file" }]);
  });

  it("builds the pickers' options: a company by name with its symbol, a concept by name", () => {
    expect(companyOptions(companies)).toEqual([{ id: "c1", label: "Kaveri Pumps", hint: "KAVPUMP" }, { id: "c2", label: "New Co", hint: null }]);
    expect(conceptOptions(concepts)).toEqual([{ id: "t1", label: "Moats", hint: null }]);
  });
});

describe("the filters in the address", () => {
  it("turns slugs into the ids the list asks for, and keeps what was chosen for the form", () => {
    expect(readFilters({ company: "kavpump", concept: "moats", public: "1", archived: "1" }, companies, concepts)).toEqual({
      companyId: "c1", themeId: "t1", onPublic: true, includeArchived: true, selected: { company: "kavpump", concept: "moats", onPublic: true, archived: true },
    });
  });

  it("ignores a slug that names nothing, and anything but 1 for a switch", () => {
    expect(readFilters({ company: "nope", concept: "../x", public: "yes" }, companies, concepts)).toEqual({
      companyId: undefined, themeId: undefined, onPublic: false, includeArchived: false, selected: { company: undefined, concept: undefined, onPublic: false, archived: false },
    });
  });
});
