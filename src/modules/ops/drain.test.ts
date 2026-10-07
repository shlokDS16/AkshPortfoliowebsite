import { describe, expect, it, vi } from "vitest";
import { aiReadingOn, SERVER_DAILY_STEPS, SERVER_PUMP_STEPS, summaryText, sweepText } from "./drain";
import { DAILY_STEPS, PUMP_STEPS } from "./schedule";

const env = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => env.value }));

describe("the server step lists (extend Phase 1, do not replace it)", () => {
  it("keeps each clock's heartbeat first and adds one ingestion step", () => {
    expect(SERVER_PUMP_STEPS.map((s) => s.job)).toEqual([...PUMP_STEPS.map((s) => s.job), "ingestion:drain"]);
    expect(SERVER_DAILY_STEPS.map((s) => s.job)).toEqual([...DAILY_STEPS.map((s) => s.job), "ingestion:sweep"]);
  });
});

describe("summaryText (the heartbeat detail: counts only, never document or error text)", () => {
  it("names the counts that are not zero", () => {
    expect(summaryText({ ran: 4, done: 3, deferred: 1, attention: 0, leaseLost: 0 })).toBe("ran 4, done 3, deferred 1");
    expect(summaryText({ ran: 3, done: 1, deferred: 0, attention: 1, leaseLost: 1 })).toBe("ran 3, done 1, needs attention 1, lease lost 1");
  });

  it("says when there was nothing to do", () => {
    expect(summaryText({ ran: 0, done: 0, deferred: 0, attention: 0, leaseLost: 0 })).toBe("nothing to run");
  });
});

describe("sweepText (the daily sweep also prunes the usage ledger)", () => {
  const idle = { ran: 0, done: 0, deferred: 0, attention: 0, leaseLost: 0 };

  it("says how many ledger rows the prune removed, and stays quiet when none", () => {
    expect(sweepText(idle, 0)).toBe("nothing to run");
    expect(sweepText(idle, 12)).toBe("nothing to run, pruned 12");
    expect(sweepText({ ...idle, ran: 2, done: 2 }, 3)).toBe("ran 2, done 2, pruned 3");
  });
});

describe("aiReadingOn (createLlmPort over the server env)", () => {
  it("is off without a Groq key or the fixture adapter", () => {
    env.value = {};
    expect(aiReadingOn()).toBe(false);
  });

  it("is on with a Groq key", () => {
    env.value = { GROQ_API_KEY: `gsk_${"k".repeat(40)}` };
    expect(aiReadingOn()).toBe(true);
  });

  it("is on with the fixture adapter locally, and off when Vercel would get fake figures (R27)", () => {
    env.value = { LLM_ADAPTER: "fixture" };
    expect(aiReadingOn()).toBe(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    env.value = { LLM_ADAPTER: "fixture", VERCEL_ENV: "production" };
    expect(aiReadingOn()).toBe(false);
  });
});
