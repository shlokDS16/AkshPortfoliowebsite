import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorText } from "@/lib/messages";
import { LedgerError, LEDGER_ERROR_TEXT, type LedgerErrorCode } from "./errors";
import { createFakeLedgerRepo } from "./fake-repo";

const order: string[] = [];
const state = vi.hoisted(() => ({ repo: null as unknown }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const revalidatePath = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return {};
  },
}));
vi.mock("./repo", () => ({ createSupabaseLedgerRepo: () => state.repo }));

import { addIdeaEventAction, openIdeaAction } from "./actions";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const IDEA = "33333333-3333-4333-8333-333333333333";
const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  return data;
};
const idea = { companyId: COMPANY, expects: "underperform", horizon: "other", horizonOther: "540", held: "yes", bodyMd: "  Why I think so.\r\n  And what would prove me wrong.  " };
const noState = { error: null };

async function redirected(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1] as string;
    throw error;
  }
  throw new Error("expected a redirect");
}

let repo: ReturnType<typeof createFakeLedgerRepo>;
beforeEach(() => {
  repo = createFakeLedgerRepo();
  state.repo = repo;
  order.length = 0;
  requireAdmin.mockClear();
  redirect.mockClear();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("every action checks the admin first and reaches nothing when that fails", () => {
  it("openIdeaAction", async () => {
    requireAdmin.mockImplementationOnce(async () => {
      throw new Error("NEXT_REDIRECT:/login");
    });
    await expect(openIdeaAction(noState, form(idea))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).not.toContain("client");
    expect(repo.calls).toEqual([]);
  });
  it("addIdeaEventAction", async () => {
    requireAdmin.mockImplementationOnce(async () => {
      throw new Error("NEXT_REDIRECT:/login");
    });
    await expect(addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "note", bodyMd: "W" }))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(repo.calls).toEqual([]);
  });
  it("runs requireAdmin before the database client is made", async () => {
    await redirected(() => openIdeaAction(noState, form(idea)));
    expect(order.slice(0, 2)).toEqual(["requireAdmin", "client"]);
  });
});

describe("openIdeaAction", () => {
  it("a good form calls the service once with a number and a boolean, then lands on the idea with the sealed notice", async () => {
    const to = await redirected(() => openIdeaAction(noState, form(idea)));
    expect(to).toBe("/desk/ledger/idea-new?notice=idea-recorded");
    expect(repo.calls).toHaveLength(1);
    expect(repo.calls[0]).toEqual({
      method: "openIdea",
      args: [{ companyId: COMPANY, expects: "underperform", horizonDays: 540, held: true, bodyMd: "  Why I think so.\n  And what would prove me wrong.  ", itemId: null }],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/desk/ledger");
  });

  it("sends no date: the form has none and the call carries none", async () => {
    await redirected(() => openIdeaAction(noState, form({ ...idea, openedAt: "2020-01-01", recordedAt: "2020-01-01" })));
    expect(JSON.stringify(repo.calls[0]!.args)).not.toMatch(/2020|openedAt|recordedAt/);
  });

  const bad: [string, Record<string, string>, LedgerErrorCode][] = [
    ["no words", { bodyMd: "   \n  " }, "ledger-words-required"],
    ["words over the limit", { bodyMd: "x".repeat(10_001) }, "ledger-body-too-long"],
    ["a horizon under 30 days", { horizon: "other", horizonOther: "29" }, "ledger-bad-horizon"],
    ["a horizon over 10 years", { horizon: "other", horizonOther: "3651" }, "ledger-bad-horizon"],
    ["a horizon that is not a number", { horizon: "other", horizonOther: "soon" }, "ledger-bad-horizon"],
    ["no horizon chosen", { horizon: "" }, "ledger-bad-horizon"],
    ["no direction chosen", { expects: "" }, "ledger-bad-input"],
    ["no answer to whether he holds it", { held: "" }, "ledger-bad-input"],
    ["a company that is not an id", { companyId: "x" }, "ledger-bad-input"],
  ];
  for (const [name, change, code] of bad) {
    it(`${name}: the state carries ${code}, the database is not reached`, async () => {
      const result = await openIdeaAction(noState, form({ ...idea, ...change }));
      expect(result).toEqual({ error: code });
      expect(repo.calls).toEqual([]);
    });
  }

  describe("linking the idea to a file (task 10 review I3)", () => {
    const ITEM = "22222222-2222-4222-8222-222222222222";
    it("a file of another company is refused in the action, nothing is opened", async () => {
      state.repo = repo = createFakeLedgerRepo({ itemCompanies: { [ITEM]: "99999999-9999-4999-8999-999999999999" } });
      expect(await openIdeaAction(noState, form({ ...idea, itemId: ITEM }))).toEqual({ error: "ledger-item-other-company" });
      expect(repo.calls.map((c) => c.method)).toEqual(["itemCompany"]);
    });
    it("a file of the chosen company is linked", async () => {
      state.repo = repo = createFakeLedgerRepo({ itemCompanies: { [ITEM]: COMPANY } });
      await redirected(() => openIdeaAction(noState, form({ ...idea, itemId: ITEM })));
      expect(repo.calls.at(-1)).toMatchObject({ method: "openIdea", args: [{ itemId: ITEM }] });
    });
  });

  it("every database refusal returns its plain code, never the raw message", async () => {
    for (const code of Object.keys(LEDGER_ERROR_TEXT) as LedgerErrorCode[]) {
      repo.openIdea = () => Promise.reject(new LedgerError(code));
      const result = await openIdeaAction(noState, form(idea));
      expect(result).toEqual({ error: code });
      expect(errorText(result.error ?? undefined)).toBe(LEDGER_ERROR_TEXT[code]);
    }
  });

  it("an unknown failure is 'could not save' and is logged by shape, not by message", async () => {
    repo.openIdea = () => Promise.reject(new Error("relation ideas violates something SECRET"));
    expect(await openIdeaAction(noState, form(idea))).toEqual({ error: "save-failed" });
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("SECRET");
  });
});

describe("addIdeaEventAction", () => {
  it("a good note calls the service once and returns to the entries with the notice", async () => {
    const to = await redirected(() => addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "note", bodyMd: "Margins held.\r\n" })));
    expect(to).toBe(`/desk/ledger/${IDEA}?notice=entry-added#entries`);
    expect(repo.calls).toEqual([{ method: "addEvent", args: [{ ideaId: IDEA, kind: "note", bodyMd: "Margins held.\n", stance: {} }] }]);
  });

  it("a close carries its reason as a choice, a lesson its process call and tags", async () => {
    await redirected(() => addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "close", bodyMd: "Done.", reason: "thesis_broken" })));
    await redirected(() => addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "review", bodyMd: "Lesson.", process: "flawed", tags: ["timing", "luck"] })));
    expect(repo.calls.map((c) => (c.args[0] as { stance: unknown }).stance)).toEqual([{ reason: "thesis_broken" }, { process: "flawed", tags: ["timing", "luck"] }]);
  });

  it("sold some turns the radio into the boolean; a revise with a new horizon carries a number", async () => {
    await redirected(() => addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "downsize", bodyMd: "Trimmed.", held: "yes" })));
    await redirected(() => addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "revise", bodyMd: "Longer.", horizon: "1095" })));
    expect(repo.calls.map((c) => (c.args[0] as { stance: unknown }).stance)).toEqual([{ held: true }, { horizon_days: 1095 }]);
  });

  const bad: [string, Record<string, string | string[]>, LedgerErrorCode][] = [
    ["an empty note", { kind: "note", bodyMd: " \r\n " }, "ledger-words-required"],
    ["a close with no reason", { kind: "close", bodyMd: "W" }, "ledger-bad-input"],
    ["a lesson with no tags", { kind: "review", bodyMd: "W", process: "sound" }, "ledger-bad-input"],
    ["a kind that does not exist", { kind: "edit", bodyMd: "W" }, "ledger-bad-input"],
    ["the opening entry, which only openIdea writes", { kind: "open", bodyMd: "W" }, "ledger-bad-input"],
    ["a horizon out of range", { kind: "revise", bodyMd: "W", horizon: "other", horizonOther: "5" }, "ledger-bad-horizon"],
    ["text over the limit", { kind: "note", bodyMd: "x".repeat(10_001) }, "ledger-body-too-long"],
  ];
  for (const [name, change, code] of bad) {
    it(`${name}: the state carries ${code}, the database is not reached`, async () => {
      expect(await addIdeaEventAction(noState, form({ ideaId: IDEA, ...change }))).toEqual({ error: code });
      expect(repo.calls).toEqual([]);
    });
  }

  it("an idea id that is not an id, or missing, is 'not found'", async () => {
    expect(await addIdeaEventAction(noState, form({ ideaId: "../x", kind: "note", bodyMd: "W" }))).toEqual({ error: "ledger-not-found" });
    expect(await addIdeaEventAction(noState, form({ kind: "note", bodyMd: "W" }))).toEqual({ error: "ledger-not-found" });
    expect(repo.calls).toEqual([]);
  });

  it("each refusal of the database has its plain message: opposite open, withdrawal window, not open, integrity", async () => {
    for (const code of ["ledger-void-too-late", "ledger-not-open", "ledger-not-closed", "ledger-is-void", "ledger-integrity"] as const) {
      repo.addEvent = () => Promise.reject(new LedgerError(code));
      expect(await addIdeaEventAction(noState, form({ ideaId: IDEA, kind: "note", bodyMd: "W" }))).toEqual({ error: code });
    }
  });
});
