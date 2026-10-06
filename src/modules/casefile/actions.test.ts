import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { latestFigureDate } from "./figure-dates";
import { parseFactsSheet } from "./sheet";

const state = vi.hoisted(() => ({ repo: null as unknown }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const requireAdmin = vi.fn(async () => ({ userId: "u-1", email: "aksh@example.com" }));

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/modules/research", async (original) => ({ ...(await original<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.repo }));

import { saveCaseFileRevisionAction, setFiguresToAction } from "./actions";

let repo: MemoryResearchRepo;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
async function target(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1];
    throw error;
  }
  throw new Error("expected a redirect");
}
const param = (to: string, name: string) => new URL(to, "http://x").searchParams.get(name);

async function thesis(): Promise<string> {
  const item = await repo.insertItem({ kind: "thesis", title: "Kaveri file", companyId: null, themeId: null, learningObjective: "Learn X." });
  return item.id;
}

beforeEach(() => {
  repo = createMemoryResearchRepo();
  state.repo = repo;
  redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("saveCaseFileRevisionAction", () => {
  it("stores the words and the parsed facts as one revision, in separate fields", async () => {
    const id = await thesis();
    const to = await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: KAVERI.revisions[1].bodyMd, factsSheet: KAVERI.revisions[1].sheet, changeReason: " first " })));
    expect(to).toBe(`/desk/items/${id}?notice=revision-saved`);
    const saved = repo.revisions.at(-1)!;
    expect(saved.bodyMd).toBe(KAVERI.revisions[1].bodyMd);
    expect(saved.structured).toEqual(parseFactsSheet(KAVERI.revisions[1].sheet).caseFile);
    expect(saved.changeReason).toBe("first");
  });

  it("refuses a facts sheet with a bad line, with a fixed code, and stores nothing", async () => {
    const id = await thesis();
    const before = repo.revisions.length;
    const to = await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: "x", factsSheet: "Z1 | ?" })));
    expect(param(to, "error")).toBe("facts-sheet-invalid");
    expect(repo.revisions).toHaveLength(before);
  });

  it("a note (no sheet field) carries its structured data over unchanged", async () => {
    const item = await repo.insertItem({ kind: "learning", title: "Note", companyId: null, themeId: null, learningObjective: "Learn." });
    await repo.insertRevision({ itemId: item.id, bodyMd: "a", structured: { keep: "me" }, changeReason: null, author: "aksh" });
    await target(() => saveCaseFileRevisionAction(item.id, form({ bodyMd: "b" })));
    expect(repo.revisions.at(-1)?.structured).toEqual({ keep: "me" });
  });

  it("maps a malformed id to the not-found code", async () => {
    expect(param(await target(() => saveCaseFileRevisionAction("nope", form({ bodyMd: "x" }))), "error")).toBe("item-not-found");
  });
});

describe("setFiguresToAction (the date comes from the stored facts, never the request)", () => {
  it("sets data_as_of to the latest figure date of the newest revision", async () => {
    const id = await thesis();
    const caseFile = parseFactsSheet(KAVERI.revisions[1].sheet).caseFile;
    await repo.insertRevision({ itemId: id, bodyMd: "x", structured: caseFile, changeReason: null, author: "aksh" });
    const to = await target(() => setFiguresToAction(id));
    expect(to).toBe(`/desk/items/${id}?notice=figures-to-set#gate`);
    expect(repo.items.get(id)?.dataAsOf).toBe(latestFigureDate(caseFile));
  });

  it("says so when the file holds no dated figure", async () => {
    const id = await thesis();
    await repo.insertRevision({ itemId: id, bodyMd: "x", structured: {}, changeReason: null, author: "aksh" });
    expect(param(await target(() => setFiguresToAction(id)), "error")).toBe("no-figure-date");
    expect(repo.items.get(id)?.dataAsOf).toBeNull();
  });
});
