import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { KAVERI } from "@/test/fixtures/casefile";
import { caseRecordFixture } from "@/test/fixtures/case-record";

// A ledger case study is body + record only (Task 1 review, note 2; plan D41): whatever a save sends, the record is carried
// forward from the revision before it, deep-equal, and nothing else rides along in `structured`.

const state = vi.hoisted(() => ({ repo: null as unknown }));
const recordFiledFacts = vi.hoisted(() => vi.fn());
const recordFiledReadings = vi.hoisted(() => vi.fn());
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity", () => ({ requireAdmin: async () => ({ userId: "u-1", email: "aksh@example.com" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/modules/research", async (original) => ({ ...(await original<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.repo }));
vi.mock("@/modules/ingestion", async () => ({ parseStaging: (await import("@/modules/ingestion/provenance")).parseStaging, recordFiledFacts, recordFiledReadings }));

import { saveCaseFileRevisionAction } from "./actions";

let repo: MemoryResearchRepo;
const record = JSON.parse(JSON.stringify(caseRecordFixture())) as Record<string, unknown>;
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
    if (match) return match[1] as string;
    throw error;
  }
  throw new Error("expected a redirect");
}

async function ledgerCase(structured: Record<string, unknown> = { ledger: record }): Promise<string> {
  const item = await repo.insertItem({ kind: "case_study", title: "A closed idea", companyId: null, themeId: null, learningObjective: null });
  await repo.insertRevision({ itemId: item.id, bodyMd: "first", structured, changeReason: "Drafted from the ledger", author: "aksh" });
  return item.id;
}

beforeEach(() => {
  repo = createMemoryResearchRepo();
  state.repo = repo;
  redirect.mockClear();
  recordFiledFacts.mockReset().mockResolvedValue({ filed: 0 });
  recordFiledReadings.mockReset().mockResolvedValue({ filed: 0, back: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("saving a ledger case study", () => {
  it("stores the new words and carries the record forward unchanged (a note-style save)", async () => {
    const id = await ledgerCase();
    await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: "Looking back, I would watch the monsoon earlier." })));
    const saved = repo.revisions.at(-1)!;
    expect(saved.bodyMd).toBe("Looking back, I would watch the monsoon earlier.");
    expect(saved.structured).toEqual({ ledger: record });
  });

  it("ignores a facts sheet sent with it: no facts are parsed, stored or filed", async () => {
    const id = await ledgerCase();
    await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: "x", factsSheet: KAVERI.revisions[1].sheet, provenance: JSON.stringify({ staged: [], provenance: [] }) })));
    expect(repo.revisions.at(-1)!.structured).toEqual({ ledger: record });
    expect(recordFiledFacts).not.toHaveBeenCalled();
    expect(recordFiledReadings).not.toHaveBeenCalled();
  });

  it("ignores a ledger or structured field in the form, even a well-formed record of another idea", async () => {
    const id = await ledgerCase();
    const forged = { ...record, company: "Somebody Else Ltd", events: [] };
    await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: "x", ledger: JSON.stringify(forged), structured: JSON.stringify({ ledger: forged }) })));
    expect(repo.revisions.at(-1)!.structured).toEqual({ ledger: record });
  });

  it("drops every other key from structured: a ledger case is the record and the body only", async () => {
    const id = await ledgerCase({ ledger: record, facts: [{ id: "F1" }], sources: [{ title: "x" }], stray: 1 });
    await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: "x" })));
    expect(Object.keys(repo.revisions.at(-1)!.structured)).toEqual(["ledger"]);
  });

  it("carries the record forward from the NEWEST revision, not an older one", async () => {
    const id = await ledgerCase();
    const newer = { ...record, figures_to: "2026-07-01" };
    await repo.insertRevision({ itemId: id, bodyMd: "second", structured: { ledger: newer }, changeReason: "Refreshed from the ledger", author: "aksh" });
    await target(() => saveCaseFileRevisionAction(id, form({ bodyMd: "third" })));
    expect(repo.revisions.at(-1)!.structured).toEqual({ ledger: newer });
  });

  it("does not turn a file that has no record into a ledger case", async () => {
    const item = await repo.insertItem({ kind: "thesis", title: "Kaveri file", companyId: null, themeId: null, learningObjective: "Learn." });
    await target(() => saveCaseFileRevisionAction(item.id, form({ bodyMd: "x", factsSheet: KAVERI.revisions[1].sheet, ledger: JSON.stringify(record) })));
    expect(Object.hasOwn(repo.revisions.at(-1)!.structured, "ledger")).toBe(false);
  });
});
