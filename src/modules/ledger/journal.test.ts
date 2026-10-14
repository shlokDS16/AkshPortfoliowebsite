import { describe, expect, it } from "vitest";
import { LEDGER_GRID_TEXT } from "@/lib/messages-ledger";
import { journalGrid } from "./journal";
import { closedIdea, finalScore, idea, score } from "./test-fixtures";

const EMPTY = { earned: [], lucky: [], unlucky: [], deserved: [] };

describe("journalGrid: his process call against the machine's outcome", () => {
  const ideas = [
    closedIdea({ id: "e", processCall: "sound" }),
    closedIdea({ id: "l", processCall: "flawed" }),
    closedIdea({ id: "u", processCall: "sound" }),
    closedIdea({ id: "d", processCall: "flawed" }),
  ];
  const scores = [
    finalScore({ ideaId: "e", excess: 0.1 }),
    finalScore({ ideaId: "l", excess: 0.2 }),
    finalScore({ ideaId: "u", excess: -0.1 }),
    finalScore({ ideaId: "d", excess: -0.2 }),
  ];

  it("puts sound and as expected in earned, flawed and as expected in lucky, sound and not as expected in unlucky, flawed and not as expected in deserved", () => {
    expect(journalGrid(ideas, scores)).toEqual({ earned: ["e"], lucky: ["l"], unlucky: ["u"], deserved: ["d"] });
  });

  it("is empty on an empty ledger", () => {
    expect(journalGrid([], [])).toEqual(EMPTY);
  });

  it("an idea that ended level with the index (excess 0) is not as expected", () => {
    const g = journalGrid([closedIdea({ id: "z", processCall: "sound" })], [finalScore({ ideaId: "z", excess: 0 })]);
    expect(g).toEqual({ ...EMPTY, unlucky: ["z"] });
  });

  it("keeps several ideas in one cell in the order given", () => {
    const more = [closedIdea({ id: "e2", processCall: "sound" }), ...ideas];
    const g = journalGrid(more, [finalScore({ ideaId: "e2", excess: 0.5 }), ...scores]);
    expect(g.earned).toEqual(["e2", "e"]);
  });
});

describe("journalGrid: who is in no cell", () => {
  it("an unreviewed closed idea", () => {
    expect(journalGrid([closedIdea({ id: "n", processCall: null })], [finalScore({ ideaId: "n", excess: 0.3 })])).toEqual(EMPTY);
  });

  it("an open idea, even one with a process call that somehow exists", () => {
    expect(journalGrid([idea({ id: "o", processCall: "sound" })], [score({ ideaId: "o", excess: 0.3 })])).toEqual(EMPTY);
  });

  it("a withdrawn idea", () => {
    expect(journalGrid([idea({ id: "v", status: "void", processCall: "sound" })], [finalScore({ ideaId: "v", excess: 0.3 })])).toEqual(EMPTY);
  });

  it("a closed idea whose exit is not fixed yet", () => {
    expect(journalGrid([closedIdea({ id: "p" })], [score({ ideaId: "p", excess: 0.3, isFinal: false, flags: ["exit_pending"] })])).toEqual(EMPTY);
  });

  it("a closed idea with no score, or no excess", () => {
    expect(journalGrid([closedIdea({ id: "n" })], [])).toEqual(EMPTY);
    expect(journalGrid([closedIdea({ id: "n" })], [finalScore({ ideaId: "n", excess: null })])).toEqual(EMPTY);
  });

  it.each([["jump"], ["isin_changed"], ["implausible"], ["unheard_of"]])("a closed idea flagged %s (it needs a check first)", (flag) => {
    expect(journalGrid([closedIdea({ id: "f" })], [finalScore({ ideaId: "f", excess: 0.3, flags: [flag as never] })])).toEqual(EMPTY);
  });

  it("the real implausible row (excess null, return null) is in no cell", () => {
    expect(journalGrid([closedIdea({ id: "i" })], [finalScore({ ideaId: "i", excess: null, ideaReturn: null, flags: ["implausible"] })])).toEqual(EMPTY);
  });

  it("a hand-entered close is still in the grid: it is private, and named on the idea", () => {
    expect(journalGrid([closedIdea({ id: "h" })], [finalScore({ ideaId: "h", excess: 0.3, flags: ["hand_price"] })]).earned).toEqual(["h"]);
  });
});

describe("journalGrid: the outcome is whether the call ended as expected, whichever way it pointed", () => {
  it("an idea that expected to do worse and did (positive excess, the sign being flipped in SQL) is as expected", () => {
    const ideas = [
      closedIdea({ id: "dr", expects: "underperform", processCall: "sound" }),
      closedIdea({ id: "dw", expects: "underperform", processCall: "flawed" }),
      closedIdea({ id: "ur", expects: "outperform", processCall: "flawed" }),
      closedIdea({ id: "uw", expects: "outperform", processCall: "sound" }),
    ];
    const scores = [
      finalScore({ ideaId: "dr", excess: 0.2, ideaReturn: -0.1, indexReturn: 0.1 }),
      finalScore({ ideaId: "dw", excess: -0.2, ideaReturn: 0.3, indexReturn: 0.1 }),
      finalScore({ ideaId: "ur", excess: 0.05 }),
      finalScore({ ideaId: "uw", excess: -0.05 }),
    ];
    expect(journalGrid(ideas, scores)).toEqual({ earned: ["dr"], lucky: ["ur"], unlucky: ["uw"], deserved: ["dw"] });
  });

  it("the grid text says as expected and not as expected, and never claims a comparison with the index", () => {
    for (const cell of Object.values(LEDGER_GRID_TEXT)) {
      expect(cell.detail).toMatch(/as expected/);
      expect(cell.detail).not.toMatch(/ahead|behind|Nifty|index/i);
    }
    expect(LEDGER_GRID_TEXT.earned.detail).toBe("Sound process, ended as expected");
    expect(LEDGER_GRID_TEXT.unlucky.detail).toBe("Sound process, did not end as expected");
  });
});
