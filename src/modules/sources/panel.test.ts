import { describe, expect, it } from "vitest";
import { createMemorySourcesRepo, type MemorySourcesRepo } from "@/test/fakes/sources-repo";
import { loadPanel } from "./panel";
import { saveSource } from "./service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-16T08:00:00Z");

async function add(repo: MemorySourcesRepo, url: string, companyIds: string[], note = "") {
  const { id } = await saveSource(repo, { url, note, companyIds, themeIds: [] }, NOW);
  return id;
}
const entry = (link: string, over: Record<string, unknown> = {}) => ({ link, show: true, metaSha: "a".repeat(64), note: "for readers", ...over });

describe("loadPanel (the file's Outside sources panel)", () => {
  it("lists the company's sources, newest first, none ticked when the revision lists none", async () => {
    const repo = createMemorySourcesRepo(() => `2026-10-0${repo.records.size + 1}T05:00:00Z`);
    const a = await add(repo, "https://a.example/one", [COMPANY]);
    const b = await add(repo, "https://b.example/two", [COMPANY]);
    await add(repo, "https://c.example/three", [OTHER]);
    const rows = await loadPanel(repo, COMPANY, {});
    expect(rows.map((r) => r.record.id)).toEqual([b, a]);
    expect(rows.every((r) => !r.listed && r.problem === null)).toBe(true);
  });

  it("puts the ones the revision lists first, in its order, with its choice and its words", async () => {
    const repo = createMemorySourcesRepo(() => `2026-10-0${repo.records.size + 1}T05:00:00Z`);
    const a = await add(repo, "https://a.example/one", [COMPANY], "private one");
    const b = await add(repo, "https://b.example/two", [COMPANY]);
    const c = await add(repo, "https://c.example/three", [COMPANY]);
    const rows = await loadPanel(repo, COMPANY, { studied: [entry(a, { show: false, metaSha: null, note: "" }), entry(b, { note: "readers see this" })] });
    expect(rows.map((r) => [r.record.id, r.listed, r.showTitle, r.publicNote])).toEqual([
      [a, true, false, ""],
      [b, true, true, "readers see this"],
      [c, false, true, ""],
    ]);
  });

  it("keeps a listed source that can no longer be listed, with the reason, so he can take it off", async () => {
    const repo = createMemorySourcesRepo();
    const gone = await add(repo, "https://a.example/gone", [COMPANY]);
    const archived = await add(repo, "https://a.example/archived", [COMPANY]);
    const detached = await add(repo, "https://a.example/detached", [OTHER]);
    repo.records.get(gone)!.gone = true;
    repo.records.get(archived)!.archivedAt = "2026-10-15T05:00:00Z";
    const rows = await loadPanel(repo, COMPANY, { studied: [entry(gone), entry(archived), entry(detached)] });
    expect(rows.map((r) => [r.record.id, r.problem])).toEqual([[gone, "gone"], [archived, "archived"], [detached, "detached"]]);
  });

  it("ignores an entry that is not well formed and one whose link does not exist", async () => {
    const repo = createMemorySourcesRepo();
    const a = await add(repo, "https://a.example/one", [COMPANY]);
    const rows = await loadPanel(repo, COMPANY, { studied: [{ link: "nope" }, entry("33333333-3333-4333-8333-333333333333"), entry(a)] });
    expect(rows.map((r) => r.record.id)).toEqual([a]);
  });
});
