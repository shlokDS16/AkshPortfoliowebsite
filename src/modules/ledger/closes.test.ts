import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { errorCode } from "@/lib/messages";
import { createFakeDb } from "./fake-db";
import { createFakeLedgerRepo } from "./fake-repo";
import { buildClosesView } from "./closes";
import { LedgerError } from "./errors";
import { corporateActionFromForm, enterCloseFromForm } from "./form-input";
import { buildJournal, buildClosesPage } from "./queries";
import { createSupabaseLedgerRepo } from "./repo";
import { corporateActionInput, enterCloseInput } from "./schema";
import { addCorporateAction, enterClose } from "./service";
import { change, closedIdea, event, finalScore, idea } from "./test-fixtures";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OLD = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-10-14";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};
const pick = { id: COMPANY, name: "Acme Ltd", symbol: "ACME", needsReview: false };

describe("the typed-close form and schema", () => {
  const base = { companyId: COMPANY, date: "2026-10-12", close: "1234.50", indexClose: "" };

  it("turns the form into the call: the close stays text, a blank index close is null", () => {
    const input = enterCloseFromForm(form(base));
    expect(input).toEqual({ companyId: COMPANY, tradeDate: "2026-10-12", close: "1234.50", indexClose: null });
    expect(enterCloseInput.safeParse(input).success).toBe(true);
    expect(enterCloseInput.parse(enterCloseFromForm(form({ ...base, indexClose: " 22363.35 " }))).indexClose).toBe("22363.35");
  });

  it.each(["", "0", "0.0", "-5", "12x", "1,234.50", "1e3", "NaN", "Infinity", "1234.56789", "12345678901", ".5", "5.", "+5", "0x10", " "])(
    "refuses a close of %j in plain words",
    (close) => {
      const parsed = enterCloseInput.safeParse(enterCloseFromForm(form({ ...base, close })));
      expect(parsed.success).toBe(false);
      expect(errorCode((parsed as { error: ZodError }).error)).toBe("ledger-bad-close");
    },
  );

  it.each(["", "2026-02-30", "12-10-2026", "2026-10-12T00:00", "yesterday", "2026-13-01"])("refuses a date of %j", (date) => {
    const parsed = enterCloseInput.safeParse(enterCloseFromForm(form({ ...base, date })));
    expect(parsed.success).toBe(false);
    expect(errorCode((parsed as { error: ZodError }).error)).toBe("ledger-bad-date");
  });

  it("refuses a company that is not an id, an index close that is not a number, and a stray field", () => {
    expect(enterCloseInput.safeParse(enterCloseFromForm(form({ ...base, companyId: "x" }))).success).toBe(false);
    expect(enterCloseInput.safeParse(enterCloseFromForm(form({ ...base, indexClose: "abc" }))).success).toBe(false);
    expect(enterCloseInput.safeParse({ ...(enterCloseFromForm(form(base)) as object), source: "nse_fetch" }).success).toBe(false);
  });
});

describe("the corporate-action form and schema", () => {
  const base = { companyId: COMPANY, kind: "split", exDate: "2026-09-01", factor: "5", note: "" };
  const parse = (over: Record<string, string>) => corporateActionInput.safeParse(corporateActionFromForm(form({ ...base, ...over })));

  it("a split with its factor and no note", () => {
    const parsed = parse({});
    expect(parsed.success && parsed.data).toEqual({ companyId: COMPANY, kind: "split", exDate: "2026-09-01", factor: 5, note: null, supersedes: null });
  });

  it("'no action needed' takes no factor; it is exactly 1", () => {
    expect(parse({ kind: "none", factor: "" })).toMatchObject({ success: true, data: { factor: 1 } });
    expect(parse({ kind: "none", factor: "1" })).toMatchObject({ success: true });
    expect(parse({ kind: "none", factor: "2" }).success).toBe(false);
  });

  it.each(["", "0", "0.0009", "1000.01", "-2", "abc", "1e2", "1", "1.0", "2,5"])("refuses a factor of %j for a split", (factor) => {
    const parsed = parse({ factor });
    expect(parsed.success).toBe(false);
    expect(errorCode((parsed as { error: ZodError }).error)).toBe("ledger-bad-factor");
  });

  it("accepts the ends of the range", () => {
    expect(parse({ factor: "0.001" }).success).toBe(true);
    expect(parse({ factor: "1000" }).success).toBe(true);
    expect(parse({ kind: "bonus", factor: "2.5" }).success).toBe(true);
    expect(parse({ kind: "other", factor: "0.5" }).success).toBe(true);
  });

  it("refuses a kind that does not exist, a date that is not a date or before 2000", () => {
    expect(parse({ kind: "dividend" }).success).toBe(false);
    expect(parse({ exDate: "2026-02-30" }).success).toBe(false);
    expect(parse({ exDate: "1999-12-31" }).success).toBe(false);
  });

  it("keeps the note as typed (line breaks put back to LF, nothing else), and refuses one over 500 characters", () => {
    expect(parse({ note: "  1:5 split\r\nper the filing  " })).toMatchObject({ success: true, data: { note: "  1:5 split\nper the filing  " } });
    expect(parse({ note: "x".repeat(500) }).success).toBe(true);
    const long = parse({ note: "x".repeat(501) });
    expect(long.success).toBe(false);
    expect(errorCode((long as { error: ZodError }).error)).toBe("ledger-note-too-long");
  });

  it("a correction names the entry it replaces, and it must be an id", () => {
    expect(parse({ supersedes: OLD })).toMatchObject({ success: true, data: { supersedes: OLD } });
    expect(parse({ supersedes: "not-an-id" }).success).toBe(false);
  });
});

describe("enterClose and addCorporateAction (service)", () => {
  it("looks up the company's symbol, stores through the repo, and reports whether a close was stored", async () => {
    const repo = createFakeLedgerRepo({ companies: [pick] });
    const input = { companyId: COMPANY, tradeDate: "2026-10-12", close: "1234.50", indexClose: "22363.35" };
    expect(await enterClose(repo, input, TODAY)).toEqual({ stored: 1, kept: 0 });
    expect(repo.calls.at(-1)).toEqual({ method: "enterClose", args: [{ tradeDate: "2026-10-12", symbol: "ACME", close: "1234.50", indexClose: "22363.35" }] });
    // What the database wrote is what is reported: a close left as it was is "kept", never "stored" (upload review I-1).
    expect(await enterClose(createFakeLedgerRepo({ companies: [pick], enterStored: 0, enterKept: 1 }), input, TODAY)).toEqual({ stored: 0, kept: 1 });
    expect(await enterClose(createFakeLedgerRepo({ companies: [pick], enterStored: 0 }), input, TODAY)).toEqual({ stored: 0, kept: 0 });
  });

  it("refuses a day more than 400 days back, with a plain message, before the database; the 400th day is still taken (upload review M-3)", async () => {
    const repo = createFakeLedgerRepo({ companies: [pick] });
    const input = (tradeDate: string) => ({ companyId: COMPANY, tradeDate, close: "10", indexClose: null });
    // 400 days before 14 Oct 2026 is 9 Sep 2025.
    await expect(enterClose(repo, input("2025-09-08"), TODAY)).rejects.toMatchObject({ code: "ledger-close-too-old" });
    expect(repo.calls.some((c) => c.method === "enterClose")).toBe(false);
    await expect(enterClose(repo, input("2025-09-09"), TODAY)).resolves.toEqual({ stored: 1, kept: 0 });
  });

  it("refuses a day after today before the database, a company that is not listed, and one with no symbol or still in review", async () => {
    const good = { companyId: COMPANY, tradeDate: "2026-10-15", close: "10", indexClose: null };
    const repo = createFakeLedgerRepo({ companies: [pick] });
    await expect(enterClose(repo, good, TODAY)).rejects.toMatchObject({ code: "ledger-close-too-early" });
    await expect(enterClose(repo, { ...good, tradeDate: "2026-10-12", companyId: OLD }, TODAY)).rejects.toMatchObject({ code: "ledger-not-found" });
    await expect(enterClose(createFakeLedgerRepo({ companies: [{ ...pick, symbol: null }] }), { ...good, tradeDate: "2026-10-12" }, TODAY)).rejects.toMatchObject({ code: "ledger-no-symbol" });
    await expect(enterClose(createFakeLedgerRepo({ companies: [{ ...pick, needsReview: true }] }), { ...good, tradeDate: "2026-10-12" }, TODAY)).rejects.toMatchObject({ code: "ledger-no-symbol" });
    expect(repo.calls.some((c) => c.method === "enterClose")).toBe(false);
  });

  it("a bad number never reaches the repo", async () => {
    const repo = createFakeLedgerRepo({ companies: [pick] });
    await expect(enterClose(repo, { companyId: COMPANY, tradeDate: "2026-10-12", close: "0", indexClose: null }, TODAY)).rejects.toBeInstanceOf(ZodError);
    expect(repo.calls).toEqual([]);
  });

  it("appends an action; an ex-date more than a year ahead is refused", async () => {
    const repo = createFakeLedgerRepo();
    const input = { companyId: COMPANY, kind: "split", exDate: "2026-09-01", factor: 5, note: null, supersedes: null };
    expect(await addCorporateAction(repo, input, TODAY)).toBe("action-new");
    expect(repo.calls.at(-1)).toEqual({ method: "addAction", args: [input] });
    await expect(addCorporateAction(repo, { ...input, exDate: "2027-12-31" }, TODAY)).rejects.toBeInstanceOf(LedgerError);
    await expect(addCorporateAction(repo, { ...input, factor: 1 }, TODAY)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("the repo's new doors", () => {
  it("enterClose sends one row with no series and no ISIN, and never a source", async () => {
    const { db, calls } = createFakeDb([{ data: { stored: 1, kept: 0 } }]);
    expect(await createSupabaseLedgerRepo(db).enterClose({ tradeDate: "2026-10-12", symbol: "ACME", close: "1234.50", indexClose: null })).toEqual({ stored: 1, kept: 0 });
    expect(calls[0]).toEqual({
      target: "rpc:enter_closes",
      ops: [["args", { p_trade_date: "2026-10-12", p_rows: [{ symbol: "ACME", close: "1234.50" }], p_index_close: null }]],
    });
  });

  it("enterClose reports what the database wrote and what it kept (an object or a one-row list), and no answer is nothing written", async () => {
    const call = { tradeDate: "2026-10-12", symbol: "ACME", close: "1", indexClose: null };
    expect(await createSupabaseLedgerRepo(createFakeDb([{ data: { stored: 0, kept: 1 } }]).db).enterClose(call)).toEqual({ stored: 0, kept: 1 });
    expect(await createSupabaseLedgerRepo(createFakeDb([{ data: [{ stored: 0, kept: 1 }] }]).db).enterClose(call)).toEqual({ stored: 0, kept: 1 });
    expect(await createSupabaseLedgerRepo(createFakeDb([{ data: null }]).db).enterClose(call)).toEqual({ stored: 0, kept: 0 });
  });

  it("enterClose maps the database's refusals to plain codes", async () => {
    for (const [message, code] of [["ledger:future_date", "ledger-close-too-early"], ["ledger:weekend", "ledger-close-weekend"], ["ledger:day_shut", "ledger-day-shut"], ["ledger:bad_close", "ledger-bad-close"]] as const) {
      const { db } = createFakeDb([{ error: { message, code: "P0001" } }]);
      const error = await createSupabaseLedgerRepo(db).enterClose({ tradeDate: "2026-10-12", symbol: "ACME", close: "1", indexClose: null }).catch((e: unknown) => e);
      expect(errorCode(error)).toBe(code);
    }
  });

  it("addAction inserts the six granted columns and returns the id; its refusals are plain", async () => {
    const { db, calls } = createFakeDb([{ data: { id: "a1" } }]);
    const repo = createSupabaseLedgerRepo(db);
    const call = { companyId: COMPANY, exDate: "2026-09-01", factor: 5, kind: "split" as const, note: null, supersedes: null };
    expect(await repo.addAction(call)).toBe("a1");
    expect(calls[0]!.target).toBe("corporate_actions");
    expect(calls[0]!.ops[0]).toEqual(["insert", { company_id: COMPANY, ex_date: "2026-09-01", factor: 5, kind: "split", note: null, supersedes: null }]);
    for (const [code, expected] of [["23505", "ledger-action-duplicate"], ["23514", "ledger-bad-factor"], ["23503", "ledger-bad-input"], ["P0001", "ledger-bad-input"]] as const) {
      const failing = createFakeDb([{ error: { message: "row ACME 5 secret", code } }]);
      const error = await createSupabaseLedgerRepo(failing.db).addAction(call).catch((e: unknown) => e);
      expect(errorCode(error)).toBe(expected);
      expect((error as Error).message).not.toMatch(/secret|ACME/);
    }
  });

  it("the calendar, closes and actions are read with named columns, from a date, paged", async () => {
    const { db, calls } = createFakeDb([
      { data: [{ trade_date: "2026-10-12", status: "open", source: "nse_fetch" }, { trade_date: "2026-10-11", status: "pending", source: "x" }] },
      { data: [{ company_id: COMPANY, trade_date: "2026-10-12", close: "10.5", source: "manual" }, { company_id: null, trade_date: "2026-10-12", close: 9, source: "x" }] },
      { data: [{ id: "a1", company_id: COMPANY, ex_date: "2026-09-01", factor: "5.000000", kind: "split", note: null, supersedes: null, created_at: "2026-09-02T00:00:00Z" }] },
    ]);
    const repo = createSupabaseLedgerRepo(db);
    expect(await repo.listMarketDays("2026-10-01")).toEqual([{ tradeDate: "2026-10-12", status: "open", source: "nse_fetch" }]);
    expect(await repo.listCloses("2026-09-14")).toEqual([{ companyId: COMPANY, tradeDate: "2026-10-12", close: 10.5, source: "manual" }]);
    expect((await repo.listActions())[0]).toMatchObject({ id: "a1", factor: 5, kind: "split" });
    expect(calls.map((c) => c.target)).toEqual(["market_days", "prices_daily", "corporate_actions"]);
    expect(calls[0]!.ops).toContainEqual(["gte", "trade_date", "2026-10-01"]);
    expect(calls[1]!.ops).toContainEqual(["gte", "trade_date", "2026-09-14"]);
  });
});

describe("the Closes view", () => {
  const acme = idea({ id: "a", companyId: COMPANY, companyName: "Acme Ltd", symbol: "ACME", openedAt: "2026-10-08T05:00:00.000Z" });
  const later = idea({ id: "b", companyId: OLD, companyName: "Later Ltd", symbol: "LATE", openedAt: "2026-10-13T05:00:00.000Z" });
  const days = [
    { tradeDate: "2026-10-09", status: "open" as const, source: "nse_fetch" },
    { tradeDate: "2026-10-12", status: "open" as const, source: "nse_upload" },
    { tradeDate: "2026-10-13", status: "shut" as const, source: "nse_fetch" },
  ];
  const view = (over: Partial<Parameters<typeof buildClosesView>[0]> = {}) =>
    buildClosesView({
      today: TODAY, days, closes: [], uploads: [], ideas: [acme, later], scores: [], actions: [], changes: [],
      companies: [pick, { id: OLD, name: "Later Ltd", symbol: "LATE", needsReview: false }],
      handCloses: (over.closes ?? []).filter((c) => c.source !== "nse_fetch"),
      ...over,
    });

  it("lists the last ten days, weekends left out, each with its state and source in words", () => {
    const v = view();
    // 14 Oct 2026 is a Wednesday; the 10th and 11th are a weekend with no row, so they are left out.
    expect(v.days.map((d) => [d.date, d.state])).toEqual([
      ["2026-10-14", "today"], ["2026-10-13", "shut"], ["2026-10-12", "open"], ["2026-10-09", "open"],
      ["2026-10-08", "undecided"], ["2026-10-07", "undecided"], ["2026-10-06", "undecided"], ["2026-10-05", "undecided"],
    ]);
    expect(v.days.find((d) => d.date === "2026-10-12")?.sourceText).toBe("a file you uploaded as NSE's official file");
    expect(v.days.find((d) => d.date === "2026-10-09")?.sourceText).toBe("NSE's official file, fetched by the desk");
    expect(v.days.find((d) => d.date === "2026-10-13")?.stateText).toBe("Shut: no trading");
  });

  it("names the tracked companies missing a close on an open day, but only those with an idea already open that day", () => {
    const v = view({ closes: [{ companyId: COMPANY, tradeDate: "2026-10-09", close: 10, source: "nse_fetch" }] });
    expect(v.days.find((d) => d.date === "2026-10-09")?.missing).toEqual([]); // Acme has its close; Later Ltd's idea opened on the 13th
    expect(v.days.find((d) => d.date === "2026-10-12")?.missing).toEqual(["Acme Ltd"]);
    expect(v.days.find((d) => d.date === "2026-10-13")?.missing).toEqual([]); // shut: nothing is expected
  });

  it("a closed idea is no longer waited for once its score rests on fetched closes at both ends", () => {
    const done = closedIdea({ id: "c", companyId: OLD, companyName: "Done Ltd", openedAt: "2026-10-01T05:00:00.000Z" });
    const v = view({ ideas: [done], scores: [finalScore({ ideaId: "c", entrySource: "nse_fetch", markSource: "nse_fetch" })] });
    expect(v.days.find((d) => d.date === "2026-10-12")?.missing).toEqual([]);
    const typed = view({ ideas: [done], scores: [finalScore({ ideaId: "c", entrySource: "nse_fetch", markSource: "manual" })] });
    expect(typed.days.find((d) => d.date === "2026-10-12")?.missing).toEqual(["Done Ltd"]);
  });

  it("lists closes that are not NSE's own fetched file, newest first, with their source", () => {
    const v = view({
      closes: [
        { companyId: COMPANY, tradeDate: "2026-10-09", close: 100, source: "manual" },
        { companyId: COMPANY, tradeDate: "2026-10-12", close: 101.5, source: "nse_upload" },
        { companyId: COMPANY, tradeDate: "2026-10-12", close: 7, source: "nse_fetch" },
        { companyId: COMPANY, tradeDate: "2026-08-01", close: 5, source: "manual" },
        { companyId: COMPANY, tradeDate: "2025-08-01", close: 4, source: "manual" },
      ],
    });
    // M-3: the list reaches 400 days back (the span a close may be stored for), so a close typed in August is still shown; one from
    // before 9 September 2025 (more than 400 days before 14 October 2026) is not.
    expect(v.hand.map((h) => [h.date, h.close, h.sourceText])).toEqual([
      ["2026-10-12", "101.50", "a file you uploaded as NSE's official file"],
      ["2026-10-09", "100.00", "a close you typed"],
      ["2026-08-01", "5.00", "a close you typed"],
    ]);
  });

  it("lists the recorded uploads: India date and time, the trading date, 12 characters of the hash, stored and kept", () => {
    const v = view({
      uploads: [{ id: 3, uploadedAt: "2026-10-13T20:00:00.000Z", tradeDate: "2026-10-13", zipSha256: "ab".repeat(32), stored: 2, kept: 1, indexGiven: true }],
    });
    expect(v.uploads).toEqual([{ id: 3, uploadedOn: "14 Oct 2026", uploadedAt: "01:30", tradeDate: "2026-10-13", hash12: "abababababab", countsText: "stored 2, kept 1, with the Nifty 50 close" }]);
  });

  it("groups corporate actions by company, shows a replaced entry as replaced and links a correction to what it corrects", () => {
    const a = { id: "a1", companyId: COMPANY, exDate: "2026-09-01", factor: 5, kind: "split" as const, note: "per filing", supersedes: null, createdAt: "2026-09-02T05:00:00.000Z" };
    const b = { id: "a2", companyId: COMPANY, exDate: "2026-09-01", factor: 4, kind: "split" as const, note: null, supersedes: "a1", createdAt: "2026-09-03T05:00:00.000Z" };
    const n = { id: "a3", companyId: COMPANY, exDate: "2026-08-01", factor: 1, kind: "none" as const, note: null, supersedes: null, createdAt: "2026-08-02T05:00:00.000Z" };
    const [group] = view({ actions: [b, a, n] }).actions;
    expect(group).toMatchObject({ name: "Acme Ltd", symbol: "ACME" });
    expect(group!.live.map((l) => [l.id, l.factorText, l.corrects])).toEqual([["a2", "factor 4", "a1"], ["a3", "no price change to apply", null]]);
    expect(group!.replaced.map((l) => [l.id, l.kindText, l.note])).toEqual([["a1", "Split", "per filing"]]);
  });

  it("lists lately restated scores with the idea's name and the old and new figure; older ones are left out", () => {
    const recent = change({ ideaId: "a", id: 2, changedAt: "2026-10-13T05:00:00.000Z", changed: ["entry_close"], was: { entry_close: 100 }, became: { entry_close: 101.5 } });
    const old = change({ ideaId: "a", id: 1, changedAt: "2026-07-01T05:00:00.000Z" });
    const v = view({ changes: [recent, old] });
    expect(v.restated).toHaveLength(1);
    expect(v.restated[0]).toMatchObject({ ideaId: "a", name: "Acme Ltd" });
    expect(v.restated[0]!.restated.lines).toEqual(["Entry close: was 100.00, now 101.50."]);
  });

  it("offers only companies with an idea on file (not a withdrawn one), a symbol, and no review pending", () => {
    const v = view({
      ideas: [acme, idea({ id: "w", companyId: OLD, status: "void" })],
      companies: [pick, { id: OLD, name: "Void Ltd", symbol: "VOID", needsReview: false }, { id: "x", name: "Idea-less", symbol: "NONE", needsReview: false }],
    });
    expect(v.companies.map((c) => c.name)).toEqual(["Acme Ltd"]);
  });
});

describe("the pages' reads", () => {
  it("buildClosesPage reads the window and carries the status; a failed read of the calendar throws, never an empty page", async () => {
    const repo = createFakeLedgerRepo({ marketDays: [{ tradeDate: "2026-10-12", status: "open", source: "nse_fetch" }], companies: [pick], ideas: [idea({ id: "a", companyId: COMPANY, companyName: "Acme Ltd" })] });
    const page = await buildClosesPage(repo, TODAY);
    expect(page.days.some((d) => d.date === "2026-10-12" && d.state === "open")).toBe(true);
    expect(page.status).toEqual({ latestOpenDay: null, latestOfficialDay: null, handEnteredDays: 0 });
    const broken = createFakeLedgerRepo({ failWith: new Error("down") });
    await expect(buildClosesPage(broken, TODAY)).rejects.toThrow("down");
    vi.restoreAllMocks();
  });

  it("buildJournal returns the lessons newest first, each with its idea, his words untouched", async () => {
    const ideas = [closedIdea({ id: "a", companyName: "Acme Ltd" }), closedIdea({ id: "b", companyName: "Beta Ltd" })];
    const lessons = [
      event({ id: "e2", ideaId: "b", seq: 9, kind: "review", bodyMd: "  second\n lesson  ", stance: { process: "flawed", tags: ["timing", "luck"] } }),
      event({ id: "e1", ideaId: "a", seq: 3, kind: "review", bodyMd: "first", stance: { process: "sound", tags: ["none"] } }),
      event({ id: "e0", ideaId: "gone", seq: 1, kind: "review", bodyMd: "orphan", stance: {} }),
    ];
    const list = await buildJournal(createFakeLedgerRepo({ ideas, events: lessons }));
    expect(list.map((l) => [l.name, l.entry.body])).toEqual([["Beta Ltd", "  second\n lesson  "], ["Acme Ltd", "first"]]);
    expect(list[0]!.entry.choices.join(" | ")).toMatch(/flawed/i);
  });
});
