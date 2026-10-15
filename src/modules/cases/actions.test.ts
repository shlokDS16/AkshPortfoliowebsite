import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { caseRecordFixture, FIXTURE_IDEA } from "@/test/fixtures/case-record";
import { CaseError } from "./errors";
import type { CasesRepo } from "./types";

const state = vi.hoisted(() => ({ research: null as unknown, cases: null as unknown, admin: true }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/identity", () => ({
  requireAdmin: async () => {
    if (!state.admin) throw new Error("NEXT_REDIRECT:/login");
    return { userId: "u-1", email: "aksh@example.com" };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/modules/research", async (original) => ({ ...(await original<typeof import("@/modules/research")>()), createSupabaseResearchRepo: () => state.research }));
vi.mock("./repo", () => ({ createSupabaseCasesRepo: () => state.cases }));

import { draftCaseStudyAction, refreshCaseStudyAction } from "./actions";

let research: MemoryResearchRepo;
let record: unknown;
let failure: CaseError | null;
const param = (to: string, name: string) => new URL(to, "http://x").searchParams.get(name);
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

beforeEach(() => {
  research = createMemoryResearchRepo();
  record = JSON.parse(JSON.stringify(caseRecordFixture()));
  failure = null;
  const cases: CasesRepo = {
    async buildRecord() {
      if (failure) throw failure;
      return record;
    },
    async switches() {
      return { reveal: false, chart: false };
    },
    async resolveCompany(id) {
      return id;
    },
    async findItemForIdea(ideaId) {
      return research.revisions.find((r) => (r.structured.ledger as { idea?: string } | undefined)?.idea === ideaId)?.itemId ?? null;
    },
  };
  state.research = research;
  state.cases = cases;
  state.admin = true;
  redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("draftCaseStudyAction", () => {
  it("drafts the item and opens it with a fixed notice", async () => {
    const to = await target(() => draftCaseStudyAction(FIXTURE_IDEA));
    const item = [...research.items.values()][0]!;
    expect(to).toBe(`/desk/items/${item.id}?notice=case-drafted`);
    expect(item.kind).toBe("case_study");
  });

  it("opens the existing item on a second tap and makes no second one", async () => {
    await target(() => draftCaseStudyAction(FIXTURE_IDEA));
    await target(() => draftCaseStudyAction(FIXTURE_IDEA));
    expect(research.items.size).toBe(1);
  });

  it("goes back to the idea with the lesson sentence when there is no lesson yet", async () => {
    failure = new CaseError("case-no-lesson");
    const to = await target(() => draftCaseStudyAction(FIXTURE_IDEA));
    expect(to.startsWith(`/desk/ledger/${FIXTURE_IDEA}?`)).toBe(true);
    expect(param(to, "error")).toBe("case-no-lesson");
    expect(research.items.size).toBe(0);
  });

  it("maps an id that is not an idea to not-found", async () => {
    expect(param(await target(() => draftCaseStudyAction("nope")), "error")).toBe("case-not-found");
  });

  it("does nothing for a visitor who is not the admin", async () => {
    state.admin = false;
    await expect(draftCaseStudyAction(FIXTURE_IDEA)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(research.items.size).toBe(0);
  });
});

describe("refreshCaseStudyAction", () => {
  const drafted = async () => {
    await target(() => draftCaseStudyAction(FIXTURE_IDEA));
    return [...research.items.keys()][0]!;
  };

  it("says so when the record already matches", async () => {
    const id = await drafted();
    expect(await target(() => refreshCaseStudyAction(id))).toBe(`/desk/items/${id}?notice=case-unchanged`);
  });

  it("refreshes a changed record", async () => {
    const id = await drafted();
    record = JSON.parse(JSON.stringify(caseRecordFixture({ figures_to: "2026-07-20" })));
    expect(await target(() => refreshCaseStudyAction(id))).toBe(`/desk/items/${id}?notice=case-refreshed`);
    expect(research.revisions).toHaveLength(2);
  });

  it("says the revision waits for the gate on a public item", async () => {
    const id = await drafted();
    research.setVisibility(id, "public");
    record = JSON.parse(JSON.stringify(caseRecordFixture({ figures_to: "2026-07-20" })));
    expect(await target(() => refreshCaseStudyAction(id))).toBe(`/desk/items/${id}?notice=revision-pending-gate`);
  });

  it("maps an unknown item to not-found", async () => {
    expect(param(await target(() => refreshCaseStudyAction("nope")), "error")).toBe("item-not-found");
  });

  it("does nothing for a visitor who is not the admin", async () => {
    const id = await drafted();
    state.admin = false;
    await expect(refreshCaseStudyAction(id)).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
