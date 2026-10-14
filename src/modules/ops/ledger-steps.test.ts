import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFixtureAnchorDirectory, fixtureAnchorDirectory, seedFixtureAnchor } from "@/lib/providers/fixture-anchor";
import type { Db } from "@/lib/supabase/types";
import type { HeartbeatRepo } from "./heartbeat";
import { fakeAnchorDb, fileOf, rowsFor } from "./ledger-anchor-test-kit";
import { buildAnchorDeps, buildLedgerDeps, ledgerDailySteps, LEDGER_DAILY_STEPS, runLedgerNow } from "./ledger-steps";
import { fakeLedgerDb } from "./ledger-test-kit";
import { runSteps, type Step } from "./steps";

const mocks = vi.hoisted(() => ({ env: {} as Record<string, string | undefined>, db: null as unknown as Db, serviceCalls: 0 }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => mocks.env }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => {
    mocks.serviceCalls += 1;
    return mocks.db;
  },
}));

// A loopback address of its own: the fixture gist lives in a directory named from the database address, and this test must
// never read or write the one the local e2e stack uses (127.0.0.1:54321).
const LOOPBACK = "http://127.0.0.1:54399";
const GIST_DIR = fixtureAnchorDirectory(LOOPBACK);
const seedGist = (file: string, text: string) => seedFixtureAnchor(file, text, { directory: GIST_DIR });
const heartbeats = () => {
  const beats: { job: string; ok: boolean; detail: string }[] = [];
  const repo: HeartbeatRepo = { record: async (b) => void beats.push(b), latestRuns: async () => ({}) };
  return { beats, repo };
};
/** One database for all three steps: the closes and scores double for most names, the anchor double for its table and its seal. */
const bothDb = (anchor: ReturnType<typeof fakeAnchorDb>, ledger: Db = fakeLedgerDb({ today: "2026-10-14", symbols: [] }).db): Db =>
  ({
    rpc: (name: string, args?: Record<string, unknown>) => (name === "seal_ledger_days" ? anchor.db.rpc(name as never) : ledger.rpc(name as never, args as never)),
    from: (table: string) => (table === "ledger_anchors" ? anchor.db.from(table as never) : ledger.from(table as never)),
  }) as unknown as Db;

beforeEach(() => {
  mocks.serviceCalls = 0;
  mocks.env = { LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: LOOPBACK };
  mocks.db = bothDb(fakeAnchorDb({}));
  clearFixtureAnchorDirectory(GIST_DIR);
});

afterAll(() => clearFixtureAnchorDirectory(GIST_DIR));

describe("the ledger's daily steps", () => {
  it("are ledger:prices, ledger:score, then ledger:anchor", () => {
    expect(LEDGER_DAILY_STEPS.map((s) => s.job)).toEqual(["ledger:prices", "ledger:score", "ledger:anchor"]);
  });

  it("build nothing until they run: no secret-key client at import, none for a list that is never run", () => {
    expect(mocks.serviceCalls).toBe(0);
    ledgerDailySteps();
    expect(mocks.serviceCalls).toBe(0);
  });

  it("build the deps from the server env and the India date", () => {
    const deps = buildLedgerDeps();
    expect(deps.db).toBe(mocks.db);
    expect(deps.market().name).toBe("fixture");
    expect(deps.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("build the anchor deps lazily, with the port from the server env", () => {
    const deps = buildAnchorDeps();
    expect(deps.db).toBe(mocks.db);
    expect(deps.anchor().name).toBe("fixture"); // LLM_ADAPTER=fixture against a loopback database
    mocks.env = {};
    expect(buildAnchorDeps().anchor().name).toBe("off");
  });
});

describe("runLedgerNow (the same steps, each with its own heartbeat)", () => {
  it("with nothing tracked records all three steps as ok", async () => {
    const { beats, repo } = heartbeats();
    const results = await runLedgerNow(repo);
    expect(results.map((r) => [r.job, r.ok, r.detail])).toEqual([
      ["ledger:prices", true, "nothing to fetch"],
      ["ledger:score", true, "scored 0 ideas"],
      ["ledger:anchor", true, "sealed 0 days; no finished day to publish yet"],
    ]);
    expect(beats.map((b) => b.job)).toEqual(["ledger:prices", "ledger:score", "ledger:anchor"]);
  });

  it("a fixture adapter pointed at a hosted database fails ledger:prices and ledger:anchor with a plain reason, and ledger:score still runs", async () => {
    mocks.env = { LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" };
    const { beats, repo } = heartbeats();
    const results = await runLedgerNow(repo);
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["ledger:prices", false],
      ["ledger:score", true],
      ["ledger:anchor", false],
    ]);
    expect(beats[0]?.detail).toMatch(/not set up correctly/);
    expect(beats[0]?.detail).not.toContain("abcdefgh");
    expect(beats[2]?.detail).toMatch(/^the public copy is not set up correctly/);
    expect(beats[2]?.detail).not.toContain("abcdefgh");
  });

  it("a refusal to score (broken chain) fails ledger:score only", async () => {
    mocks.db = bothDb(fakeAnchorDb({}), fakeLedgerDb({ today: "2026-10-14", symbols: [], score: { error: { message: "ledger:chain_broken", code: "P0001" } } }).db);
    const results = await runLedgerNow(heartbeats().repo);
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["ledger:prices", true],
      ["ledger:score", false],
      ["ledger:anchor", true],
    ]);
    expect(results[1]?.detail).toContain("chain_broken");
  });
});

describe("ledger:anchor writes a heartbeat on EVERY run (the /api/health check goes red on a failed or stale latest run)", () => {
  const anchorBeat = async (anchorDb: ReturnType<typeof fakeAnchorDb>) => {
    mocks.db = bothDb(anchorDb);
    const { beats, repo } = heartbeats();
    await runLedgerNow(repo);
    return beats.filter((b) => b.job === "ledger:anchor");
  };

  it("not configured (the default): seals, succeeds, and still writes its heartbeat", async () => {
    mocks.env = {};
    expect(await anchorBeat(fakeAnchorDb({ rows: rowsFor("2026-10-01"), sealAdds: rowsFor("2026-10-02") }))).toEqual([
      { job: "ledger:anchor", ok: true, detail: "sealed 1 day; the public copy is off, 2 days waiting" },
    ]);
  });

  it("publishes: a heartbeat with dates and counts only", async () => {
    expect(await anchorBeat(fakeAnchorDb({ rows: rowsFor("2026-10-01") }))).toEqual([
      { job: "ledger:anchor", ok: true, detail: "sealed 0 days; added 1 day to the public copy (2026-10-01)" },
    ]);
  });

  it("nothing to add: a successful heartbeat", async () => {
    seedGist("ledger-2026.jsonl", fileOf("2026-10-01"));
    const published = rowsFor("2026-10-01").map((r) => ({ ...r, published: true }));
    expect(await anchorBeat(fakeAnchorDb({ rows: published }))).toEqual([
      { job: "ledger:anchor", ok: true, detail: "sealed 0 days; the public copy is up to date" },
    ]);
  });

  it("a failure is a red heartbeat with the plain reason kept in the detail", async () => {
    seedGist("ledger-2026.jsonl", "something else\n");
    const beats = await anchorBeat(fakeAnchorDb({ rows: rowsFor("2026-10-01").map((r) => ({ ...r, published: true })) }));
    expect(beats).toEqual([
      { job: "ledger:anchor", ok: false, detail: "the public file ledger-2026.jsonl differs from the ledger at line 1 (2026-10-01); nothing was published" },
    ]);
  });

  it("a broken chain from the seal is a red heartbeat, and the steps after it still run", async () => {
    const sweep = vi.fn(async () => "ran 0");
    mocks.db = bothDb(fakeAnchorDb({ seal: { error: { message: "ledger:chain_broken", code: "P0001" } } }));
    const { beats, repo } = heartbeats();
    const results = await runSteps([...ledgerDailySteps(), { job: "ingestion:sweep", run: sweep }], (b) => repo.record(b));
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["ledger:prices", true],
      ["ledger:score", true],
      ["ledger:anchor", false],
      ["ingestion:sweep", true],
    ]);
    expect(beats.find((b) => b.job === "ledger:anchor")?.detail).toBe("the ledger failed its own check (chain_broken); nothing was sealed or published");
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

describe("a ledger failure never stops the later steps of the daily run", () => {
  it("records the failure and still runs the sweep that follows", async () => {
    const sweep = vi.fn(async () => "ran 0");
    const down = () => {
      throw new Error("SUPABASE_SECRET_KEY is not set");
    };
    const failing = ledgerDailySteps(down, down);
    const steps: Step[] = [{ job: "heartbeat:daily", run: async () => "alive" }, ...failing, { job: "ingestion:sweep", run: sweep }];
    const { beats, repo } = heartbeats();
    const results = await runSteps(steps, (b) => repo.record(b));
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["heartbeat:daily", true],
      ["ledger:prices", false],
      ["ledger:score", false],
      ["ledger:anchor", false],
      ["ingestion:sweep", true],
    ]);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(beats).toHaveLength(5);
  });
});
