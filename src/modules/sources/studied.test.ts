import { describe, expect, it } from "vitest";
import { createMemorySourcesRepo } from "@/test/fakes/sources-repo";
import { SourceError } from "./errors";
import { saveSource } from "./service";
import { buildStudiedEntries, MAX_STUDIED, readStudied, readStudiedForm, studiedStructured, withStudied } from "./studied";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const CO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = new Date("2026-10-16T08:00:00Z");

const form = (entries: Record<string, string>[]) => {
  const f = new FormData();
  for (const e of entries) {
    f.append("link", e.link);
    if (e.showTitle) f.set(`showTitle:${e.link}`, e.showTitle);
    if (e.note !== undefined) f.set(`note:${e.link}`, e.note);
  }
  return f;
};

describe("readStudiedForm: the panel's fields", () => {
  it("reads each ticked source in order, with its title tick and the words readers see", () => {
    const rows = readStudiedForm(form([{ link: L1, showTitle: "on", note: " my note " }, { link: L2, note: "" }]));
    expect(rows).toEqual([{ link: L1, showTitle: true, note: "my note" }, { link: L2, showTitle: false, note: "" }]);
  });

  it("drops a link that is not a UUID, a repeated link, and anything but strings", () => {
    const f = form([{ link: L1, showTitle: "on" }]);
    f.append("link", "not-a-uuid");
    f.append("link", L1);
    f.append("link", new File(["x"], "x.txt"));
    expect(readStudiedForm(f).map((r) => r.link)).toEqual([L1]);
  });

  it("reads a UUID in capitals as the lower-case one the database holds", () => {
    expect(readStudiedForm(form([{ link: L1.toUpperCase() }]))[0].link).toBe(L1);
  });
});

describe("buildStudiedEntries: the table's hash, never the form's", () => {
  const sha = (link: string) => ({ [L1]: SHA_A, [L2]: null })[link] ?? null;

  it("takes metaSha from the table for a shown title, and none for a plain link", () => {
    const entries = buildStudiedEntries([{ link: L1, showTitle: true, note: "n1" }, { link: L2, showTitle: false, note: "n2" }], sha);
    expect(entries).toEqual([
      { link: L1, show: true, metaSha: SHA_A, note: "n1" },
      { link: L2, show: false, metaSha: null, note: "n2" },
    ]);
  });

  it("shows no title for a source that has never been read, even if ticked", () => {
    expect(buildStudiedEntries([{ link: L2, showTitle: true, note: "" }], sha)[0]).toEqual({ link: L2, show: false, metaSha: null, note: "" });
  });

  it("refuses more than 12 entries and a note over 500 characters", () => {
    const many = Array.from({ length: MAX_STUDIED + 1 }, (_, i) => ({ link: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, showTitle: false, note: "" }));
    expect(() => buildStudiedEntries(many, sha)).toThrow(expect.objectContaining({ code: "studied-too-many" }));
    expect(() => buildStudiedEntries([{ link: L1, showTitle: false, note: "n".repeat(501) }], sha)).toThrow(expect.objectContaining({ code: "studied-note-long" }));
    expect(buildStudiedEntries([{ link: L1, showTitle: false, note: "n".repeat(500) }], sha)[0].note).toHaveLength(500);
  });

  it("builds entries with exactly the four keys the gate wants", () => {
    const [entry] = buildStudiedEntries([{ link: L1, showTitle: true, note: "n" }], sha);
    expect(Object.keys(entry).sort()).toEqual(["link", "metaSha", "note", "show"]);
  });
});

describe("withStudied and readStudied", () => {
  it("sets the key, keeps every other key, and removes the key when the list is empty", () => {
    const entries = [{ link: L1, show: false, metaSha: null, note: "" }];
    expect(withStudied({ schema: "casefile/1", facts: [1] }, entries)).toEqual({ schema: "casefile/1", facts: [1], studied: entries });
    expect(withStudied({ schema: "casefile/1", studied: entries }, [])).toEqual({ schema: "casefile/1" });
  });

  it("reads the well-formed entries of a revision and ignores the rest", () => {
    const good = { link: L1, show: true, metaSha: SHA_A, note: "n" };
    expect(readStudied({ studied: [good, { link: "x" }, 5, { ...good, extra: 1 }] })).toEqual([good]);
    expect(readStudied({})).toEqual([]);
    expect(readStudied({ studied: "no" })).toEqual([]);
    expect(readStudied(null)).toEqual([]);
  });
});

describe("studiedStructured: a company file's structured record with the chosen sources", () => {
  async function world() {
    const repo = createMemorySourcesRepo();
    const a = await saveSource(repo, { url: "https://a.example/1", note: "", companyIds: [CO], themeIds: [] }, NOW);
    const b = await saveSource(repo, { url: "https://b.example/2", note: "", companyIds: [CO], themeIds: [] }, NOW);
    repo.records.get(a.id)!.metaSha = SHA_A;
    repo.records.get(b.id)!.metaSha = SHA_B;
    return { repo, a: a.id, b: b.id };
  }
  const file = { kind: "thesis" as const, companyId: CO, previous: { schema: "casefile/1", facts: [{ id: "F1" }] } };
  const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as SourceError | null)?.code;

  it("keeps the rest of the record and writes the entries with the table's hashes", async () => {
    const { repo, a, b } = await world();
    const out = await studiedStructured(repo, file, [{ link: a, showTitle: true, note: "one" }, { link: b, showTitle: false, note: "two" }]);
    expect(out).toEqual({ schema: "casefile/1", facts: [{ id: "F1" }], studied: [{ link: a, show: true, metaSha: SHA_A, note: "one" }, { link: b, show: false, metaSha: null, note: "two" }] });
  });

  it("takes the key off when nothing is chosen", async () => {
    const { repo } = await world();
    expect(await studiedStructured(repo, { ...file, previous: { schema: "casefile/1", studied: [{ link: L1, show: false, metaSha: null, note: "" }] } }, [])).toEqual({ schema: "casefile/1" });
  });

  it("accepts a case study that is not a ledger case, and refuses a ledger case and any other kind", async () => {
    const { repo, a } = await world();
    const rows = [{ link: a, showTitle: false, note: "" }];
    expect(await studiedStructured(repo, { ...file, kind: "case_study" }, rows)).toHaveProperty("studied");
    expect(await code(studiedStructured(repo, { ...file, kind: "case_study", previous: { ledger: {} } }, rows))).toBe("studied-not-company-file");
    for (const kind of ["note", "learning", "video", "letter"] as const) expect(await code(studiedStructured(repo, { ...file, kind }, rows)), kind).toBe("studied-not-company-file");
    expect(await code(studiedStructured(repo, { ...file, companyId: null }, rows))).toBe("studied-not-company-file");
  });

  it("refuses a source of another company, an archived one, one that is gone, and one that does not exist", async () => {
    const { repo, a, b } = await world();
    expect(await code(studiedStructured(repo, { ...file, companyId: OTHER_CO }, [{ link: a, showTitle: false, note: "" }]))).toBe("studied-not-attached");
    repo.records.get(a)!.archivedAt = NOW.toISOString();
    expect(await code(studiedStructured(repo, file, [{ link: a, showTitle: false, note: "" }]))).toBe("studied-unavailable");
    repo.records.get(b)!.gone = true;
    expect(await code(studiedStructured(repo, file, [{ link: b, showTitle: false, note: "" }]))).toBe("studied-unavailable");
    expect(await code(studiedStructured(repo, file, [{ link: L2, showTitle: false, note: "" }]))).toBe("studied-unavailable");
  });
});
