import { describe, expect, it } from "vitest";
import { createMemorySourcesRepo } from "@/test/fakes/sources-repo";
import { SourceError } from "./errors";
import { archiveSource, restoreSource, saveSource, updateSource } from "./service";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const uuidN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-10-16T08:00:00Z");
const base = { note: "", companyIds: [], themeIds: [] };

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  const e = await promise.then(() => null, (x: unknown) => x);
  return e instanceof SourceError ? e.code : undefined;
}

describe("saveSource: a new link", () => {
  it("a link with and without its tracking parameters is the same source, and the tracking parameters are not stored", async () => {
    const repo = createMemorySourcesRepo();
    const first = await saveSource(repo, { ...base, url: "https://youtu.be/dQw4w9WgXcQ?si=AbC123&feature=share&t=42" }, NOW);
    expect(repo.records.get(first.id)).toMatchObject({ url: "https://youtu.be/dQw4w9WgXcQ?t=42", kind: "youtube", youtubeId: "dQw4w9WgXcQ" });
    expect(await saveSource(repo, { ...base, url: "https://youtu.be/dQw4w9WgXcQ?t=42" }, NOW)).toMatchObject({ id: first.id, duplicate: true });
    expect(await saveSource(repo, { ...base, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&pp=ygUE" }, NOW)).toMatchObject({ id: first.id, duplicate: true });
    const page = await saveSource(repo, { ...base, url: "https://example.com/p?id=7&utm_source=x&fbclid=1&gclid=2" }, NOW);
    expect(repo.records.get(page.id)?.url).toBe("https://example.com/p?id=7");
    expect(await saveSource(repo, { ...base, url: "https://example.com/p?id=7" }, NOW)).toMatchObject({ id: page.id, duplicate: true });
  });

  it("stores the link as saved (http upgraded, host in lower case, tracking parameters dropped), its kind and key, his note as typed, and attaches the companies and concepts", async () => {
    const repo = createMemorySourcesRepo();
    const got = await saveSource(repo, { url: " http://www.Example.com/Post?utm_source=x ", note: " why the bull case is thin ", companyIds: [C1, C2, C1], themeIds: [T1] }, NOW);
    expect(got).toMatchObject({ duplicate: false, savedOn: null, noteAdded: false, restored: false, answer: "Source saved. Reading its title." });
    expect(repo.records.get(got.id)).toMatchObject({
      url: "https://www.example.com/Post", kind: "web", youtubeId: null, note: "why the bull case is thin", companyIds: [C1, C2], themeIds: [T1],
    });
  });

  it("knows a YouTube link by its id", async () => {
    const repo = createMemorySourcesRepo();
    const got = await saveSource(repo, { ...base, url: "https://youtu.be/dQw4w9WgXcQ?si=abc" }, NOW);
    expect(repo.records.get(got.id)).toMatchObject({ kind: "youtube", youtubeId: "dQw4w9WgXcQ" });
  });

  it("refuses a text that is not a link, a note over 4,000 characters, and more than 5 companies or 8 concepts, saving nothing", async () => {
    const repo = createMemorySourcesRepo();
    expect(await code(saveSource(repo, { ...base, url: "not a link" }, NOW))).toBe("source-no-link");
    expect(await code(saveSource(repo, { ...base, url: "https://a.example/x", note: "n".repeat(4001) }, NOW))).toBe("source-note-full");
    expect(await code(saveSource(repo, { ...base, url: "https://a.example/x", companyIds: Array.from({ length: 6 }, (_, i) => uuidN(i)) }, NOW))).toBe("source-too-many-companies");
    expect(await code(saveSource(repo, { ...base, url: "https://a.example/x", themeIds: Array.from({ length: 9 }, (_, i) => uuidN(i)) }, NOW))).toBe("source-too-many-concepts");
    expect(repo.records.size).toBe(0);
  });

  it("takes exactly 4,000 characters of note", async () => {
    const repo = createMemorySourcesRepo();
    const got = await saveSource(repo, { ...base, url: "https://a.example/x", note: "n".repeat(4000) }, NOW);
    expect(repo.records.get(got.id)?.note).toHaveLength(4000);
  });
});

describe("saveSource: the same link again (dedupe, spec s6.2)", () => {
  async function saved() {
    const repo = createMemorySourcesRepo(() => "2026-10-03T05:00:00.000Z");
    const first = await saveSource(repo, { url: "https://example.com/post/", note: "first thought", companyIds: [C1], themeIds: [] }, new Date("2026-10-03T05:00:00Z"));
    return { repo, id: first.id };
  }

  it("adds nothing new, appends his note under a dated line and says when he saved it", async () => {
    const { repo, id } = await saved();
    const again = await saveSource(repo, { url: "https://www.example.com/post?utm_campaign=z", note: "second thought", companyIds: [], themeIds: [] }, NOW);
    expect(again).toMatchObject({ id, duplicate: true, savedOn: "2026-10-03", noteAdded: true, restored: false });
    expect(again.answer).toBe("You saved this link on 3 Oct 2026. Your note was added to it.");
    expect(repo.records.size).toBe(1);
    expect(repo.records.get(id)?.note).toBe("first thought\n\n— 16 Oct 2026\nsecond thought");
  });

  it("dates the first note when the old note was empty", async () => {
    const repo = createMemorySourcesRepo();
    const first = await saveSource(repo, { ...base, url: "https://example.com/a" }, NOW);
    await saveSource(repo, { ...base, url: "https://example.com/a", note: "now a note" }, NOW);
    expect(repo.records.get(first.id)?.note).toBe("— 16 Oct 2026\nnow a note");
  });

  it("does not add the same words twice (a retried filing), and adds no note when he typed none", async () => {
    const { repo, id } = await saved();
    const same = await saveSource(repo, { url: "https://example.com/post", note: "first thought", companyIds: [], themeIds: [] }, NOW);
    expect(same).toMatchObject({ duplicate: true, noteAdded: false, answer: "You saved this link on 3 Oct 2026." });
    const none = await saveSource(repo, { url: "https://example.com/post", note: "", companyIds: [], themeIds: [] }, NOW);
    expect(none.noteAdded).toBe(false);
    expect(repo.records.get(id)?.note).toBe("first thought");
  });

  it("adds new companies and concepts, as many as fit, and never removes one", async () => {
    const { repo, id } = await saved();
    await saveSource(repo, { url: "https://example.com/post", note: "", companyIds: [C2, uuidN(1), uuidN(2), uuidN(3), uuidN(4)], themeIds: [T1] }, NOW);
    expect(repo.records.get(id)?.companyIds).toEqual([C1, C2, uuidN(1), uuidN(2), uuidN(3)]);
    expect(repo.records.get(id)?.themeIds).toEqual([T1]);
  });

  it("brings an archived link back and says so", async () => {
    const { repo, id } = await saved();
    await archiveSource(repo, id, NOW);
    const again = await saveSource(repo, { url: "https://example.com/post", note: "back", companyIds: [], themeIds: [] }, NOW);
    expect(again).toMatchObject({ restored: true });
    expect(again.answer).toBe("You saved this link on 3 Oct 2026. Your note was added to it. It is back on your list.");
    expect(repo.records.get(id)?.archivedAt).toBeNull();
  });

  it("refuses a note that would take the old note past 4,000 characters, changing nothing", async () => {
    const repo = createMemorySourcesRepo();
    const first = await saveSource(repo, { ...base, url: "https://example.com/a", note: "o".repeat(3990) }, NOW);
    const before = repo.log.length;
    expect(await code(saveSource(repo, { ...base, url: "https://example.com/a", note: "n".repeat(50), companyIds: [C1] }, NOW))).toBe("source-note-full");
    expect(repo.log.length).toBe(before);
    expect(repo.records.get(first.id)?.companyIds).toEqual([]);
  });

  it("treats a lost race on the key as a repeat", async () => {
    const repo = createMemorySourcesRepo();
    await saveSource(repo, { ...base, url: "https://example.com/race", note: "mine" }, NOW);
    const real = repo.findByKey.bind(repo);
    let calls = 0;
    repo.findByKey = async (key) => (calls++ === 0 ? null : real(key)); // the first look finds nothing; the row is there by the insert
    const again = await saveSource(repo, { ...base, url: "https://example.com/race", note: "yours" }, NOW);
    expect(again.duplicate).toBe(true);
    expect(repo.records.size).toBe(1);
    expect([...repo.records.values()][0].note).toContain("yours");
  });
});

describe("updateSource, archiveSource and restoreSource", () => {
  async function one(note = "n") {
    const repo = createMemorySourcesRepo();
    const { id } = await saveSource(repo, { url: "https://example.com/a", note, companyIds: [C1], themeIds: [T1] }, NOW);
    return { repo, id };
  }

  it("sets the note, the companies and the concepts to exactly what was sent", async () => {
    const { repo, id } = await one();
    await updateSource(repo, id, { note: "changed", companyIds: [C2], themeIds: [] });
    expect(repo.records.get(id)).toMatchObject({ note: "changed", companyIds: [C2], themeIds: [] });
  });

  it("changes only what was sent", async () => {
    const { repo, id } = await one();
    await updateSource(repo, id, { note: "only the note" });
    expect(repo.records.get(id)).toMatchObject({ note: "only the note", companyIds: [C1], themeIds: [T1] });
  });

  it("refuses an unknown source, a note over 4,000, and too many companies, before any write", async () => {
    const { repo, id } = await one();
    const before = repo.log.length;
    expect(await code(updateSource(repo, uuidN(9), { note: "x" }))).toBe("source-not-found");
    expect(await code(updateSource(repo, id, { note: "n".repeat(4001) }))).toBe("source-note-full");
    expect(await code(updateSource(repo, id, { companyIds: Array.from({ length: 6 }, (_, i) => uuidN(i)) }))).toBe("source-too-many-companies");
    expect(repo.log.length).toBe(before);
  });

  it("refuses to take a company off, or archive, a link a public file shows", async () => {
    const { repo, id } = await one();
    repo.publicOn.set(id, [C1]);
    expect(await code(updateSource(repo, id, { companyIds: [C2] }))).toBe("source-on-public-file");
    expect(await code(archiveSource(repo, id, NOW))).toBe("source-on-public-file");
    expect(repo.records.get(id)?.archivedAt).toBeNull();
  });

  it("archives with the time it was done and restores", async () => {
    const { repo, id } = await one();
    await archiveSource(repo, id, NOW);
    expect(repo.records.get(id)?.archivedAt).toBe(NOW.toISOString());
    await restoreSource(repo, id);
    expect(repo.records.get(id)?.archivedAt).toBeNull();
    expect(await code(archiveSource(repo, uuidN(9), NOW))).toBe("source-not-found");
  });
});
