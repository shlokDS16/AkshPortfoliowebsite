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

import { addCorporateActionAction, addIdeaEventAction, enterCloseAction, openIdeaAction } from "./actions";

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

describe("the Closes page's two writes (Task 11)", () => {
  const PICK = { id: COMPANY, name: "Acme Ltd", symbol: "ACME", needsReview: false };
  const close = { companyId: COMPANY, date: "2026-10-12", close: "1234.50", indexClose: "" };
  const action = { companyId: COMPANY, kind: "split", exDate: "2026-09-01", factor: "5", note: "" };
  const methods = () => repo.calls.map((c) => c.method);
  beforeEach(() => {
    state.repo = repo = createFakeLedgerRepo({ companies: [PICK] });
  });

  for (const [name, run] of [
    ["enterCloseAction", () => enterCloseAction(noState, form(close))],
    ["addCorporateActionAction", () => addCorporateActionAction(noState, form(action))],
  ] as const) {
    it(`${name} checks the admin first and reaches nothing when that fails`, async () => {
      requireAdmin.mockImplementationOnce(async () => {
        throw new Error("NEXT_REDIRECT:/login");
      });
      await expect(run()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(order).not.toContain("client");
      expect(repo.calls).toEqual([]);
    });
  }

  it("a typed close is stored, the scores are refreshed, and the page shows the notice", async () => {
    const to = await redirected(() => enterCloseAction(noState, form(close)));
    expect(to).toBe("/desk/ledger/closes?notice=close-entered#typed");
    expect(methods()).toEqual(["listPickable", "enterClose", "rescore"]);
    expect(repo.calls[1]!.args[0]).toEqual({ tradeDate: "2026-10-12", symbol: "ACME", close: "1234.50", indexClose: null });
    expect(revalidatePath).toHaveBeenCalledWith("/desk/ledger", "layout");
  });

  it("a form can name no source: whatever is sent beyond the fields is ignored, and the call carries none", async () => {
    await redirected(() => enterCloseAction(noState, form({ ...close, source: "nse_fetch" })));
    expect(JSON.stringify(repo.calls[1]!.args)).not.toMatch(/nse_fetch|source/);
  });

  it("a close the database left as it was is said in words ('kept'), never as stored, and nothing is rescored (upload review I-1)", async () => {
    state.repo = repo = createFakeLedgerRepo({ companies: [PICK], enterStored: 0, enterKept: 1 });
    expect(await enterCloseAction(noState, form(close))).toEqual({ error: "ledger-close-kept-official" });
    expect(methods()).not.toContain("rescore");
  });

  it("a date more than 400 days back is refused in words before the database", async () => {
    expect(await enterCloseAction(noState, form({ ...close, date: "2025-01-01" }))).toEqual({ error: "ledger-close-too-old" });
    expect(methods()).not.toContain("enterClose");
  });

  it("no close stored (no idea on the company) is said in words, and nothing is rescored", async () => {
    state.repo = repo = createFakeLedgerRepo({ companies: [PICK], enterStored: 0 });
    expect(await enterCloseAction(noState, form(close))).toEqual({ error: "ledger-close-not-stored" });
    expect(methods()).not.toContain("rescore");
  });

  it.each([
    ["a close of zero", { close: "0" }, "ledger-bad-close"],
    ["a close with a comma", { close: "1,234.50" }, "ledger-bad-close"],
    ["no date", { date: "" }, "ledger-bad-date"],
    ["a date in the future", { date: "2999-01-01" }, "ledger-close-too-early"],
    ["a company that is not an id", { companyId: "x" }, "ledger-bad-input"],
  ] as const)("%s: %s", async (_name, change, code) => {
    expect(await enterCloseAction(noState, form({ ...close, ...change }))).toEqual({ error: code });
    expect(methods()).not.toContain("enterClose");
  });

  it("the database's refusals come back as plain codes: too early, a weekend, a shut day", async () => {
    for (const code of ["ledger-close-too-early", "ledger-close-weekend", "ledger-day-shut"] as const) {
      repo.enterClose = () => Promise.reject(new LedgerError(code));
      expect(await enterCloseAction(noState, form(close))).toEqual({ error: code });
    }
  });

  it("a failed refresh of the scores does not undo or hide the stored close", async () => {
    repo.rescore = () => Promise.reject(new Error("rescore down SECRET"));
    expect(await redirected(() => enterCloseAction(noState, form(close)))).toContain("notice=close-entered");
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("SECRET");
  });

  it("a corporate action is appended and the scores refreshed", async () => {
    const to = await redirected(() => addCorporateActionAction(noState, form(action)));
    expect(to).toBe("/desk/ledger/closes?notice=action-added#actions");
    expect(methods()).toEqual(["addAction", "rescore"]);
    expect(repo.calls[0]!.args[0]).toEqual({ companyId: COMPANY, exDate: "2026-09-01", factor: 5, kind: "split", note: null, supersedes: null });
  });

  it("a correction names the entry it replaces", async () => {
    const OLD = "22222222-2222-4222-8222-222222222222";
    await redirected(() => addCorporateActionAction(noState, form({ ...action, factor: "4", supersedes: OLD })));
    expect(repo.calls[0]!.args[0]).toMatchObject({ factor: 4, supersedes: OLD });
  });

  it.each([
    ["a factor of 1 for a split", { factor: "1" }, "ledger-bad-factor"],
    ["a factor of zero", { factor: "0" }, "ledger-bad-factor"],
    ["a factor above 1000", { factor: "1001" }, "ledger-bad-factor"],
    ["a negative factor", { factor: "-2" }, "ledger-bad-factor"],
    ["'no action' with a factor of 2", { kind: "none", factor: "2" }, "ledger-bad-factor"],
    ["a date in the far future", { exDate: "2999-01-01" }, "ledger-bad-date"],
    ["no date", { exDate: "" }, "ledger-bad-date"],
    ["a note over 500 characters", { note: "x".repeat(501) }, "ledger-note-too-long"],
  ] as const)("%s: %s", async (_name, change, code) => {
    expect(await addCorporateActionAction(noState, form({ ...action, ...change }))).toEqual({ error: code });
    expect(methods()).not.toContain("addAction");
  });

  it("an entry already made is said in words", async () => {
    repo.addAction = () => Promise.reject(new LedgerError("ledger-action-duplicate"));
    expect(await addCorporateActionAction(noState, form(action))).toEqual({ error: "ledger-action-duplicate" });
  });

  it("'no action needed' needs no factor", async () => {
    await redirected(() => addCorporateActionAction(noState, form({ ...action, kind: "none", factor: "" })));
    expect(repo.calls[0]!.args[0]).toMatchObject({ kind: "none", factor: 1 });
  });
});
