import { describe, expect, it, vi } from "vitest";
import { createFakeLedgerRepo } from "./fake-repo";
import { buildIdeaPage, buildLedgerHome } from "./queries";
import { change, closedIdea, event, finalScore, idea, score } from "./test-fixtures";

const TODAY = "2026-10-13";

describe("buildLedgerHome", () => {
  it("splits open and closed ideas, one line each, with the score and the restatements of that idea", async () => {
    const repo = createFakeLedgerRepo({
      ideas: [idea({ id: "o1" }), closedIdea({ id: "c1" }), idea({ id: "w", status: "void" })],
      scores: [score({ ideaId: "o1" }), finalScore({ ideaId: "c1" })],
      changes: [change({ ideaId: "c1", id: 5 })],
    });
    const home = await buildLedgerHome(repo, TODAY);
    expect(home.open.map((l) => l.id)).toEqual(["o1"]);
    expect(home.closed.map((l) => l.id)).toEqual(["c1"]);
    expect(home.closed[0]!.restated).toHaveLength(1);
    expect(home.open[0]!.restated).toHaveLength(0);
    expect(home.summary.withdrawn).toBe(1);
  });

  it("an empty ledger is empty, and still runs the checks", async () => {
    const home = await buildLedgerHome(createFakeLedgerRepo(), TODAY);
    expect(home.open).toEqual([]);
    expect(home.closed).toEqual([]);
    expect(home.needs).toEqual([]);
    expect(home.chain.kind).toBe("checked");
    if (home.chain.kind === "checked") expect(home.chain.report.ok).toBe(true);
  });

  it("lists the ideas that need a check, a lesson or a decision as cards", async () => {
    const repo = createFakeLedgerRepo({
      ideas: [idea({ id: "f" }), closedIdea({ id: "n", processCall: null })],
      scores: [score({ ideaId: "f", flags: ["jump"] }), finalScore({ ideaId: "n" })],
    });
    const home = await buildLedgerHome(repo, TODAY);
    expect(home.needs.map((c) => c.kind)).toEqual(["check", "lesson"]);
  });

  it("a failed integrity check is shown, with the structure the module returns", async () => {
    const repo = createFakeLedgerRepo({ chain: { ok: false, events: 4, firstBadSeq: 3, badIdea: "i" }, anchors: { ok: false, days: 2, firstBadDate: "2026-10-12", reason: "head" } });
    const home = await buildLedgerHome(repo, TODAY);
    expect(home.chain.kind).toBe("checked");
    if (home.chain.kind !== "checked") return;
    expect(home.chain.status.problems.map((p) => p.source)).toEqual(["chain", "anchors"]);
    expect(home.chain.report.ok).toBe(false);
  });

  it("a check that could not run is 'unreadable', never a pass", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repo = createFakeLedgerRepo();
    repo.checkChain = () => Promise.reject(new Error("database down: secret row data"));
    const home = await buildLedgerHome(repo, TODAY);
    expect(home.chain).toEqual({ kind: "unreadable" });
    expect(JSON.stringify(quiet.mock.calls)).not.toContain("secret row data");
    quiet.mockRestore();
  });

  it("the status lines fail soft: null, not a crash", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repo = createFakeLedgerRepo();
    repo.closesStatus = () => Promise.reject(new Error("x"));
    repo.anchorStatus = () => Promise.reject(new Error("x"));
    const home = await buildLedgerHome(repo, TODAY);
    expect(home.closes).toBeNull();
    expect(home.anchors).toBeNull();
    quiet.mockRestore();
  });

  it("a ledger that cannot be read at all throws, so the page shows its error and never an empty ledger", async () => {
    const repo = createFakeLedgerRepo({ failWith: new Error("down") });
    await expect(buildLedgerHome(repo, TODAY)).rejects.toThrow("down");
  });
});

describe("buildIdeaPage", () => {
  const ID = "00000000-0000-4000-8000-00000000000a";
  const NOW = new Date("2026-10-13T06:00:00Z"); // 11:30 India
  const sealed = "2026-10-13T04:00:00.000Z"; // 09:30 India: withdrawable until 15:00 India = 09:30Z

  const open = () =>
    createFakeLedgerRepo({
      ideas: [idea({ id: ID, openedAt: sealed })],
      events: [event({ id: "e1", ideaId: ID, seq: 2, kind: "note", recordedAt: "2026-10-13T05:00:00.000Z" }), event({ id: "e0", ideaId: ID, seq: 1, kind: "open", recordedAt: sealed, stance: { expects: "outperform", horizon_days: 365, held: false, benchmark: "NIFTY 50" } })],
    });

  it("is null for an idea that does not exist and for an id that is not an id", async () => {
    expect(await buildIdeaPage(open(), "00000000-0000-4000-8000-000000000000", NOW)).toBeNull();
    expect(await buildIdeaPage(open(), "not-an-id", NOW)).toBeNull();
  });

  it("orders the entries by sequence, reports when it was sealed, and offers every entry while the window is open", async () => {
    const repo = open();
    const page = await buildIdeaPage(repo, ID, NOW);
    expect(page?.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(page?.sealedAt).toBe(sealed);
    expect(page?.allowed).toEqual(["note", "revise", "upsize", "downsize", "close", "void"]);
    expect(page?.voidUntil).toBe("2026-10-13T09:30:00.000Z");
  });

  it("stops offering withdrawal once its window has closed", async () => {
    const repo = open();
    const page = await buildIdeaPage(repo, ID, new Date("2026-10-13T09:31:00Z"));
    expect(page?.allowed).toEqual(["note", "revise", "upsize", "downsize", "close"]);
    expect(page?.voidUntil).toBeNull();
  });

  it("a closed idea can take only a lesson; a withdrawn one nothing", async () => {
    const closed = createFakeLedgerRepo({ ideas: [closedIdea({ id: ID })], events: [event({ id: "e", ideaId: ID, seq: 1, kind: "open" })] });
    expect((await buildIdeaPage(closed, ID, NOW))?.allowed).toEqual(["review"]);
    const voided = createFakeLedgerRepo({ ideas: [idea({ id: ID, status: "void" })], events: [event({ id: "e", ideaId: ID, seq: 1, kind: "open" })] });
    expect((await buildIdeaPage(voided, ID, NOW))?.allowed).toEqual([]);
  });
});
