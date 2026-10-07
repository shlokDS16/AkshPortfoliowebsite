import { describe, expect, it } from "vitest";
import { aiReadingOn, SERVER_DAILY_STEPS, SERVER_PUMP_STEPS, summaryText } from "./drain";
import { DAILY_STEPS, PUMP_STEPS } from "./schedule";

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

describe("aiReadingOn", () => {
  it("is off until Task 9 wires the LLM port", () => {
    expect(aiReadingOn()).toBe(false);
  });
});
