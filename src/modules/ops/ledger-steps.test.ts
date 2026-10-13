import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import type { HeartbeatRepo } from "./heartbeat";
import { buildLedgerDeps, ledgerDailySteps, LEDGER_DAILY_STEPS, runLedgerNow } from "./ledger-steps";
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

const LOOPBACK = "http://127.0.0.1:54321";
const heartbeats = () => {
  const beats: { job: string; ok: boolean; detail: string }[] = [];
  const repo: HeartbeatRepo = { record: async (b) => void beats.push(b), latestRuns: async () => ({}) };
  return { beats, repo };
};

beforeEach(() => {
  mocks.serviceCalls = 0;
  mocks.env = { LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: LOOPBACK };
  mocks.db = fakeLedgerDb({ today: "2026-10-14", symbols: [] }).db;
});

describe("the ledger's daily steps", () => {
  it("are ledger:prices, then ledger:score", () => {
    expect(LEDGER_DAILY_STEPS.map((s) => s.job)).toEqual(["ledger:prices", "ledger:score"]);
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
});

describe("runLedgerNow (the same steps, each with its own heartbeat)", () => {
  it("with nothing tracked records both steps as ok", async () => {
    const { beats, repo } = heartbeats();
    const results = await runLedgerNow(repo);
    expect(results.map((r) => [r.job, r.ok, r.detail])).toEqual([
      ["ledger:prices", true, "nothing to fetch"],
      ["ledger:score", true, "scored 0 ideas"],
    ]);
    expect(beats.map((b) => b.job)).toEqual(["ledger:prices", "ledger:score"]);
  });

  it("a fixture adapter pointed at a hosted database fails ledger:prices with a plain reason, and ledger:score still runs", async () => {
    mocks.env = { LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" };
    const { beats, repo } = heartbeats();
    const results = await runLedgerNow(repo);
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["ledger:prices", false],
      ["ledger:score", true],
    ]);
    expect(beats[0]?.detail).toMatch(/not set up correctly/);
    expect(beats[0]?.detail).not.toContain("abcdefgh");
  });

  it("a refusal to score (broken chain) fails ledger:score only", async () => {
    mocks.db = fakeLedgerDb({ today: "2026-10-14", symbols: [], score: { error: { message: "ledger:chain_broken", code: "P0001" } } }).db;
    const results = await runLedgerNow(heartbeats().repo);
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["ledger:prices", true],
      ["ledger:score", false],
    ]);
    expect(results[1]?.detail).toContain("chain_broken");
  });
});

describe("a ledger failure never stops the later steps of the daily run", () => {
  it("records the failure and still runs the sweep that follows", async () => {
    const sweep = vi.fn(async () => "ran 0");
    const failing = ledgerDailySteps(() => {
      throw new Error("SUPABASE_SECRET_KEY is not set");
    });
    const steps: Step[] = [{ job: "heartbeat:daily", run: async () => "alive" }, ...failing, { job: "ingestion:sweep", run: sweep }];
    const { beats, repo } = heartbeats();
    const results = await runSteps(steps, (b) => repo.record(b));
    expect(results.map((r) => [r.job, r.ok])).toEqual([
      ["heartbeat:daily", true],
      ["ledger:prices", false],
      ["ledger:score", false],
      ["ingestion:sweep", true],
    ]);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(beats).toHaveLength(4);
  });
});
