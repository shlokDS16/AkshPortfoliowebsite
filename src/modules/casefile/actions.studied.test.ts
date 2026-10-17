import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { parseFactsSheet } from "./sheet";

// Phase 5d: a company file's revision may carry `structured.studied` (the outside sources he chose to show, rule 14). Only the sources
// module writes that key. The facts sheet rebuilds `structured` on every save, so this action carries the key forward by hand, unchanged:
// a save of the words or the facts never drops a source from a file, and never lets the form send one.
const state = vi.hoisted(() => ({ repo: null as unknown }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity", () => ({ requireAdmin: async () => ({ userId: "u-1", email: "aksh@example.com" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/modules/research", async (original) => ({ ...(await original<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.repo }));
vi.mock("@/modules/ingestion", async () => ({
  parseStaging: (await import("@/modules/ingestion/provenance")).parseStaging,
  recordFiledFacts: vi.fn(async () => ({ filed: 0 })),
  recordFiledReadings: vi.fn(async () => ({ filed: 0, back: 0 })),
}));

import { saveCaseFileRevisionAction } from "./actions";

let repo: MemoryResearchRepo;
const LINK = "11111111-1111-4111-8111-111111111111";
const STUDIED = [{ link: LINK, show: true, metaSha: "a".repeat(64), note: "why" }];
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
async function save(run: () => Promise<void>) {
  await run().catch((e: Error) => {
    if (!e.message.startsWith("NEXT_REDIRECT")) throw e;
  });
}
async function file(structured: Record<string, unknown>, kind: "thesis" | "learning" = "thesis"): Promise<string> {
  const item = await repo.insertItem({ kind, title: "File", companyId: null, themeId: null, learningObjective: "Learn." });
  await repo.insertRevision({ itemId: item.id, bodyMd: "first", structured, changeReason: "first", author: "aksh" });
  return item.id;
}

beforeEach(() => {
  repo = createMemoryResearchRepo();
  state.repo = repo;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("saveCaseFileRevisionAction carries structured.studied forward", () => {
  it("keeps the key when the facts sheet rebuilds the record", async () => {
    const id = await file({ schema: "casefile/1", studied: STUDIED });
    await save(() => saveCaseFileRevisionAction(id, form({ bodyMd: KAVERI.revisions[1].bodyMd, factsSheet: KAVERI.revisions[1].sheet })));
    const saved = repo.revisions.at(-1)!;
    expect(saved.structured).toEqual({ ...parseFactsSheet(KAVERI.revisions[1].sheet).caseFile, studied: STUDIED });
  });

  it("keeps it from the newest revision, not an older one", async () => {
    const id = await file({ schema: "casefile/1", studied: STUDIED });
    await repo.insertRevision({ itemId: id, bodyMd: "second", structured: { schema: "casefile/1" }, changeReason: "dropped", author: "aksh" });
    await save(() => saveCaseFileRevisionAction(id, form({ bodyMd: "third", factsSheet: KAVERI.revisions[1].sheet })));
    expect(repo.revisions.at(-1)!.structured).not.toHaveProperty("studied");
  });

  it("adds no key to a file that had none", async () => {
    const id = await file({ schema: "casefile/1" });
    await save(() => saveCaseFileRevisionAction(id, form({ bodyMd: "b", factsSheet: KAVERI.revisions[1].sheet })));
    expect(repo.revisions.at(-1)!.structured).not.toHaveProperty("studied");
  });

  it("ignores a studied field in the form: the sources module is the only writer of the key", async () => {
    const id = await file({ schema: "casefile/1" });
    await save(() => saveCaseFileRevisionAction(id, form({ bodyMd: "b", factsSheet: KAVERI.revisions[1].sheet, studied: JSON.stringify(STUDIED) })));
    expect(repo.revisions.at(-1)!.structured).not.toHaveProperty("studied");
  });

  it("does not touch the record of a save with no facts sheet (a note's data is carried over as it is)", async () => {
    const id = await file({ keep: "me", studied: STUDIED }, "learning");
    await save(() => saveCaseFileRevisionAction(id, form({ bodyMd: "second" })));
    expect(repo.revisions.at(-1)!.structured).toEqual({ keep: "me", studied: STUDIED });
  });

  it("a ledger case study never carries the key, whatever the previous record held", async () => {
    const id = await file({ ledger: { schema: "ledger/1" }, studied: STUDIED });
    await save(() => saveCaseFileRevisionAction(id, form({ bodyMd: "looking back" })));
    expect(repo.revisions.at(-1)!.structured).toEqual({ ledger: { schema: "ledger/1" } });
  });
});
