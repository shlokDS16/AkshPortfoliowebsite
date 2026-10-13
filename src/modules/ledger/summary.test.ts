import { describe, expect, it } from "vitest";
import { summarise } from "./summary";
import { change, closedIdea, finalScore, idea, score } from "./test-fixtures";

const TODAY = "2026-10-13";

describe("summarise: the empty ledger", () => {
  it("has no figure at all, and no list", () => {
    expect(summarise([], [], TODAY)).toEqual({
      closed: { asExpected: 0, total: 0, showPercent: false, notCounted: 0 },
      all: { asExpected: 0, total: 0 },
      byDirection: { outperform: 0, underperform: 0 },
      medianExcessClosed: null,
      medianExcessAll: null,
      holdingDays: null,
      pastHorizon: [],
      noLesson: [],
      needsCheck: [],
      waiting: [],
      exitPending: [],
      handEntered: [],
      stale: [],
      restated: [],
      withdrawn: 0,
    });
  });
});

describe("summarise: closed against all", () => {
  const ideas = [
    closedIdea({ id: "c1" }), closedIdea({ id: "c2" }), closedIdea({ id: "c3" }),
    idea({ id: "o1" }), idea({ id: "o2" }),
  ];
  const scores = [
    finalScore({ ideaId: "c1", excess: 0.2, holdingDays: 100 }),
    finalScore({ ideaId: "c2", excess: -0.05, holdingDays: 300 }),
    finalScore({ ideaId: "c3", excess: 0.1, holdingDays: 200 }),
    score({ ideaId: "o1", excess: -0.3 }),
    score({ ideaId: "o2", excess: 0.02 }),
  ];
  const s = summarise(ideas, scores, TODAY);

  it("counts the closed ideas that ended as expected, and all ideas as expected, side by side", () => {
    expect(s.closed).toMatchObject({ asExpected: 2, total: 3 });
    expect(s.all).toEqual({ asExpected: 3, total: 5 });
  });

  it("medians of excess over closed, and over all", () => {
    expect(s.medianExcessClosed).toBe(0.1); // -0.05, 0.1, 0.2
    expect(s.medianExcessAll).toBe(0.02); // -0.3, -0.05, 0.02, 0.1, 0.2
  });

  it("holding period is the closed ideas' median, shortest and longest", () => {
    expect(s.holdingDays).toEqual({ median: 200, min: 100, max: 300 });
  });

  it("an excess of exactly zero is not 'as expected'", () => {
    const r = summarise([closedIdea({ id: "z" })], [finalScore({ ideaId: "z", excess: 0 })], TODAY);
    expect(r.closed).toMatchObject({ asExpected: 0, total: 1 });
  });
});

describe("summarise: medians with an even count", () => {
  it("averages the two middle values", () => {
    const ideas = ["a", "b", "c", "d"].map((id) => closedIdea({ id }));
    const scores = [
      finalScore({ ideaId: "a", excess: 0.01, holdingDays: 10 }),
      finalScore({ ideaId: "b", excess: 0.04, holdingDays: 21 }),
      finalScore({ ideaId: "c", excess: 0.1, holdingDays: 30 }),
      finalScore({ ideaId: "d", excess: -0.2, holdingDays: 40 }),
    ];
    const s = summarise(ideas, scores, TODAY);
    expect(s.medianExcessClosed).toBe(0.025); // sorted -0.2, 0.01, 0.04, 0.1
    expect(s.holdingDays).toEqual({ median: 25.5, min: 10, max: 40 });
  });

  it("is not thrown by float noise (0.1 and 0.2 average to 0.15, not 0.15000000000000002)", () => {
    const ideas = [closedIdea({ id: "a" }), closedIdea({ id: "b" })];
    const scores = [finalScore({ ideaId: "a", excess: 0.1 }), finalScore({ ideaId: "b", excess: 0.2 })];
    expect(summarise(ideas, scores, TODAY).medianExcessClosed).toBe(0.15);
  });
});

describe("summarise: a percentage only from five closed ideas", () => {
  const closedN = (n: number) => {
    const ids = Array.from({ length: n }, (_, i) => `c${i}`);
    return summarise(ids.map((id) => closedIdea({ id })), ids.map((id) => finalScore({ ideaId: id, excess: 0.01 })), TODAY);
  };
  it("is off at 4 and on at 5", () => {
    expect(closedN(4).closed.showPercent).toBe(false);
    expect(closedN(5).closed.showPercent).toBe(true);
    expect(closedN(0).closed.showPercent).toBe(false);
  });
  it("counts only the ideas that are counted, so four counted plus a flagged one is still four", () => {
    const ideas = [...Array.from({ length: 4 }, (_, i) => closedIdea({ id: `c${i}` })), closedIdea({ id: "bad" })];
    const scores = [
      ...Array.from({ length: 4 }, (_, i) => finalScore({ ideaId: `c${i}`, excess: 0.01 })),
      finalScore({ ideaId: "bad", excess: 0.5, flags: ["jump"] }),
    ];
    expect(summarise(ideas, scores, TODAY).closed.showPercent).toBe(false);
  });
});

describe("summarise: ideas that need a check are left out and listed", () => {
  it.each([["jump"], ["isin_changed"], ["implausible"], ["a_flag_added_later"]])("%s", (flag) => {
    const s = summarise(
      [closedIdea({ id: "ok" }), closedIdea({ id: "bad" })],
      [finalScore({ ideaId: "ok", excess: 0.1 }), finalScore({ ideaId: "bad", excess: 0.9, flags: [flag as never] })],
      TODAY,
    );
    expect(s.needsCheck).toEqual(["bad"]);
    expect(s.closed).toMatchObject({ asExpected: 1, total: 1 });
    expect(s.all).toEqual({ asExpected: 1, total: 1 });
    expect(s.medianExcessClosed).toBe(0.1);
    expect(s.medianExcessAll).toBe(0.1);
    expect(s.holdingDays).toEqual({ median: 147, min: 147, max: 147 });
  });

  it("an open idea with a jump is also left out of 'all'", () => {
    const s = summarise([idea({ id: "o" })], [score({ ideaId: "o", excess: 0.4, flags: ["jump", "stale"] })], TODAY);
    expect(s.needsCheck).toEqual(["o"]);
    expect(s.all.total).toBe(0);
    expect(s.stale).toEqual([]);
  });
});

describe("summarise: withdrawn and unscored ideas", () => {
  it("counts void ideas apart and leaves them out of everything, even if a score row is still there", () => {
    const s = summarise(
      [idea({ id: "v1", status: "void" }), idea({ id: "v2", status: "void" }), idea({ id: "o" })],
      [score({ ideaId: "v1", excess: 0.5 }), score({ ideaId: "o", excess: 0.01 })],
      TODAY,
    );
    expect(s.withdrawn).toBe(2);
    expect(s.all).toEqual({ asExpected: 1, total: 1 });
    expect(s.needsCheck).toEqual([]);
    expect(s.waiting).toEqual([]);
  });

  it("an idea with no score row is waiting, in no figure", () => {
    const s = summarise([idea({ id: "new" })], [], TODAY);
    expect(s.waiting).toEqual(["new"]);
    expect(s.all.total).toBe(0);
  });

  it("an idea whose entry close is not in yet is waiting (entry_pending, no excess)", () => {
    const s = summarise(
      [idea({ id: "new" })],
      [score({ ideaId: "new", entryDate: null, entryClose: null, excess: null, ideaReturn: null, indexReturn: null, holdingDays: null, flags: ["entry_pending"] })],
      TODAY,
    );
    expect(s.waiting).toEqual(["new"]);
    expect(s.all.total).toBe(0);
    expect(s.needsCheck).toEqual([]);
  });

  it("a closed idea with no score is waiting and still lacks a lesson only if none was written", () => {
    const s = summarise([closedIdea({ id: "c", processCall: null })], [], TODAY);
    expect(s.waiting).toEqual(["c"]);
    expect(s.noLesson).toEqual(["c"]);
  });
});

describe("summarise: a closed idea whose exit is not fixed", () => {
  const ideas = [closedIdea({ id: "p" }), closedIdea({ id: "f" })];
  const scores = [score({ ideaId: "p", excess: 0.3, isFinal: false, flags: ["exit_pending"] }), finalScore({ ideaId: "f", excess: 0.1 })];
  const s = summarise(ideas, scores, TODAY);
  it("is counted in 'all' only, and listed", () => {
    expect(s.exitPending).toEqual(["p"]);
    expect(s.closed).toMatchObject({ asExpected: 1, total: 1 });
    expect(s.all).toEqual({ asExpected: 2, total: 2 });
    expect(s.medianExcessClosed).toBe(0.1);
    expect(s.holdingDays).toEqual({ median: 147, min: 147, max: 147 });
  });
});

describe("summarise: hand-entered and stale marks are counted but named", () => {
  it("lists them without removing them", () => {
    const s = summarise(
      [idea({ id: "h" }), idea({ id: "s" })],
      [score({ ideaId: "h", excess: 0.1, flags: ["hand_price"] }), score({ ideaId: "s", excess: 0.2, flags: ["stale"] })],
      TODAY,
    );
    expect(s.handEntered).toEqual(["h"]);
    expect(s.stale).toEqual(["s"]);
    expect(s.all).toEqual({ asExpected: 2, total: 2 });
  });
});

describe("summarise: an attested score is treated exactly like a hand-entered one", () => {
  it("counts it in the figures and names it with the hand-entered marks, not as needing a check", () => {
    const s = summarise(
      [idea({ id: "h" }), idea({ id: "a" }), idea({ id: "ab" })],
      [
        score({ ideaId: "h", excess: 0.1, flags: ["hand_price"] }),
        score({ ideaId: "a", excess: 0.2, flags: ["attested"] }),
        score({ ideaId: "ab", excess: -0.1, flags: ["attested", "hand_price"] }),
      ],
      TODAY,
    );
    expect(s.handEntered).toEqual(["h", "a", "ab"]);
    expect(s.needsCheck).toEqual([]);
    expect(s.all).toEqual({ asExpected: 2, total: 3 });
  });

  it("still sends an attested score to needs-a-check when a real alarm rides with it", () => {
    const s = summarise([idea({ id: "x" })], [score({ ideaId: "x", excess: 0.1, flags: ["attested", "jump"] })], TODAY);
    expect(s.needsCheck).toEqual(["x"]);
    expect(s.handEntered).toEqual([]);
    expect(s.all.total).toBe(0);
  });

  it("has a plain label (the screens read LEDGER_FLAG_TEXT)", async () => {
    const { LEDGER_FLAG_TEXT } = await import("@/lib/messages-ledger");
    expect(LEDGER_FLAG_TEXT.attested).toBe("Includes a price move or code change that you marked as needing no action.");
  });
});

describe("summarise: ideas past their horizon", () => {
  const horizon30 = (over: Parameters<typeof idea>[0]) => idea({ horizonDays: 30, ...over });
  it("an open idea is past its horizon the day after entry plus horizon", () => {
    // entry 2026-09-13 + 30 days = 2026-10-13: on that day it is not yet past; the next day it is.
    const ideas = [horizon30({ id: "x" })];
    const scores = [score({ ideaId: "x", entryDate: "2026-09-13" })];
    expect(summarise(ideas, scores, "2026-10-13").pastHorizon).toEqual([]);
    expect(summarise(ideas, scores, "2026-10-14").pastHorizon).toEqual(["x"]);
  });

  it("without an entry yet, counts from the day it was opened in India (2026-01-04T20:00Z is 5 Jan IST)", () => {
    const ideas = [horizon30({ id: "x", openedAt: "2026-01-04T20:00:00.000Z" })];
    expect(summarise(ideas, [], "2026-02-04").pastHorizon).toEqual([]);
    expect(summarise(ideas, [], "2026-02-05").pastHorizon).toEqual(["x"]);
  });

  it("never lists a closed or withdrawn idea, and still lists a flagged open one", () => {
    const ideas = [closedIdea({ id: "c", horizonDays: 30 }), horizon30({ id: "v", status: "void" }), horizon30({ id: "f" })];
    const scores = [finalScore({ ideaId: "c", entryDate: "2020-01-01" }), score({ ideaId: "f", entryDate: "2020-01-01", flags: ["jump"] })];
    expect(summarise(ideas, scores, TODAY).pastHorizon).toEqual(["f"]);
  });
});

describe("summarise: closed ideas with no lesson", () => {
  it("lists a closed idea whose process call is not written, including a flagged one, and not an open one", () => {
    const ideas = [closedIdea({ id: "a", processCall: null }), closedIdea({ id: "b" }), closedIdea({ id: "c", processCall: null }), idea({ id: "o" })];
    const scores = [finalScore({ ideaId: "a" }), finalScore({ ideaId: "c", flags: ["isin_changed"] })];
    expect(summarise(ideas, scores, TODAY).noLesson).toEqual(["a", "c"]);
  });
});

describe("summarise: restated scores stay visible", () => {
  it("names each idea with at least one restatement once, and ignores a withdrawn idea's", () => {
    const ideas = [idea({ id: "a" }), idea({ id: "b" }), idea({ id: "v", status: "void" })];
    const changes = [change({ id: 1, ideaId: "a" }), change({ id: 2, ideaId: "a" }), change({ id: 3, ideaId: "v" }), change({ id: 4, ideaId: "unknown" })];
    expect(summarise(ideas, [], TODAY, changes).restated).toEqual(["a"]);
  });

  it("lists a restated idea even when its score is flagged or waiting", () => {
    const s = summarise([idea({ id: "a" })], [score({ ideaId: "a", flags: ["jump"] })], TODAY, [change({ ideaId: "a" })]);
    expect(s.restated).toEqual(["a"]);
    expect(s.needsCheck).toEqual(["a"]);
  });
});

describe("summarise: purity", () => {
  it("keeps the order it was given and changes neither input", () => {
    const ideas = [idea({ id: "b" }), idea({ id: "a" })];
    const scores = [score({ ideaId: "a", flags: ["jump"] }), score({ ideaId: "b", flags: ["jump"] })];
    const before = JSON.stringify([ideas, scores]);
    expect(summarise(ideas, scores, TODAY).needsCheck).toEqual(["b", "a"]);
    expect(JSON.stringify([ideas, scores])).toBe(before);
  });

  it("is a pure function of its inputs", () => {
    const ideas = [closedIdea({ id: "a" })];
    const scores = [finalScore({ ideaId: "a" })];
    expect(summarise(ideas, scores, TODAY)).toEqual(summarise(ideas, scores, TODAY));
  });
});
