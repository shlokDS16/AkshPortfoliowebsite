import { describe, expect, it } from "vitest";
import { closedNotCountedText, LEDGER_OUTCOME_TEXT } from "@/lib/messages-ledger";
import { summarise } from "./summary";
import { closedIdea, finalScore, idea, score } from "./test-fixtures";

const TODAY = "2026-10-13";

describe("summarise: closed ideas left out of the headline are counted", () => {
  it("counts a closed idea that needs a check, one that is waiting and one whose exit is pending, once each", () => {
    const ideas = [
      closedIdea({ id: "ok" }), closedIdea({ id: "jump" }), closedIdea({ id: "noscore" }), closedIdea({ id: "noexcess" }), closedIdea({ id: "pending" }),
      idea({ id: "open-jump" }),
    ];
    const scores = [
      finalScore({ ideaId: "ok", excess: 0.1 }),
      finalScore({ ideaId: "jump", excess: -0.5, flags: ["jump"] }),
      finalScore({ ideaId: "noexcess", excess: null }),
      score({ ideaId: "pending", excess: 0.2, isFinal: false, flags: ["exit_pending"] }),
      score({ ideaId: "open-jump", excess: -0.4, flags: ["jump"] }),
    ];
    const s = summarise(ideas, scores, TODAY);
    expect(s.closed).toMatchObject({ total: 1, notCounted: 4 });
    expect(s.needsCheck).toEqual(["jump", "open-jump"]);
    expect(s.waiting).toEqual(["noscore", "noexcess"]);
    expect(s.exitPending).toEqual(["pending"]);
  });

  it("is zero when every closed idea is counted, and does not count open or withdrawn ideas", () => {
    const s = summarise(
      [closedIdea({ id: "a" }), idea({ id: "w" }), idea({ id: "v", status: "void" })],
      [finalScore({ ideaId: "a" })],
      TODAY,
    );
    expect(s.closed.notCounted).toBe(0);
  });

  it("a closed idea that is flagged implausible is counted as left out, not as waiting for a close", () => {
    const s = summarise([closedIdea({ id: "x" })], [finalScore({ ideaId: "x", excess: null, ideaReturn: null, flags: ["implausible"] })], TODAY);
    expect(s.closed).toMatchObject({ total: 0, notCounted: 1 });
  });
});

describe("summarise: an implausible score has no excess and still needs a check", () => {
  it("the real implausible row (excess null, return null, flag implausible) is in needsCheck and not in waiting", () => {
    const s = summarise(
      [idea({ id: "imp" })],
      [score({ ideaId: "imp", excess: null, ideaReturn: null, flags: ["implausible"] })],
      TODAY,
    );
    expect(s.needsCheck).toEqual(["imp"]);
    expect(s.waiting).toEqual([]);
    expect(s.all.total).toBe(0);
  });
});

describe("summarise: direction", () => {
  // The database flips the sign for an idea that expects to do worse than the Nifty 50, so a positive excess
  // means the call was right, not that the share beat the index.
  const ideas = [
    closedIdea({ id: "up-right", expects: "outperform" }),
    closedIdea({ id: "up-wrong", expects: "outperform" }),
    closedIdea({ id: "down-right", expects: "underperform" }),
    closedIdea({ id: "down-wrong", expects: "underperform" }),
    idea({ id: "open-down", expects: "underperform" }),
  ];
  const scores = [
    finalScore({ ideaId: "up-right", excess: 0.1 }),
    finalScore({ ideaId: "up-wrong", excess: -0.1 }),
    finalScore({ ideaId: "down-right", excess: 0.3, ideaReturn: -0.2, indexReturn: 0.1 }),
    finalScore({ ideaId: "down-wrong", excess: -0.05, ideaReturn: 0.15, indexReturn: 0.1 }),
    score({ ideaId: "open-down", excess: 0.02 }),
  ];
  const s = summarise(ideas, scores, TODAY);

  it("counts a call that ended as expected whichever way it pointed", () => {
    expect(s.closed).toMatchObject({ asExpected: 2, total: 4 });
    expect(s.all).toEqual({ asExpected: 3, total: 5 });
  });

  it("the median is of the result for the call, in the direction of each call", () => {
    expect(s.medianExcessClosed).toBe(0.025); // -0.1, -0.05, 0.1, 0.3
  });

  it("exposes how many counted ideas expected each direction", () => {
    expect(s.byDirection).toEqual({ outperform: 2, underperform: 3 });
  });

  it("does not count a flagged or waiting idea in the direction tally", () => {
    const more = summarise(
      [idea({ id: "a", expects: "underperform" }), idea({ id: "b", expects: "underperform" })],
      [score({ ideaId: "a", flags: ["jump"] })],
      TODAY,
    );
    expect(more.byDirection).toEqual({ outperform: 0, underperform: 0 });
  });
});

describe("summarise: an open idea entered today", () => {
  it("is not counted until it has been held for a day (holding days 0 or unknown)", () => {
    const s = summarise(
      [idea({ id: "today" }), idea({ id: "nodays" }), idea({ id: "day1" })],
      [
        score({ ideaId: "today", excess: 0, holdingDays: 0 }),
        score({ ideaId: "nodays", excess: 0, holdingDays: null }),
        score({ ideaId: "day1", excess: 0.05, holdingDays: 1 }),
      ],
      TODAY,
    );
    expect(s.all).toEqual({ asExpected: 1, total: 1 });
    expect(s.medianExcessAll).toBe(0.05);
    expect(s.waiting).toEqual(["today", "nodays"]);
  });

  it("does not hold a closed idea back for a same-day exit", () => {
    const s = summarise([closedIdea({ id: "c" })], [finalScore({ ideaId: "c", excess: 0.01, holdingDays: 0 })], TODAY);
    expect(s.closed).toMatchObject({ total: 1, notCounted: 0 });
  });
});

describe("summary wording", () => {
  it("says as expected for both directions, and counts the closed ideas left out in plain words", () => {
    expect(LEDGER_OUTCOME_TEXT).toBe("ended as expected");
    expect(closedNotCountedText(1)).toBe("1 closed idea not counted yet (needs a check, waiting for a close, or exit not fixed).");
    expect(closedNotCountedText(3)).toMatch(/^3 closed ideas not counted yet/);
    expect(`${LEDGER_OUTCOME_TEXT} ${closedNotCountedText(2)}`).not.toMatch(/ahead|behind|Nifty|(buy|sell|recommend|target|guarantee)/i);
  });
});
