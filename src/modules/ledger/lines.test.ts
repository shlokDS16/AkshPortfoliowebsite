import { describe, expect, it } from "vitest";
import { eventLine, ideaLine, needsYou } from "./lines";
import { change, closedIdea, event, finalScore, idea, score } from "./test-fixtures";

describe("ideaLine: the machine's figures and Aksh's choices, kept apart", () => {
  it("an open idea with figures shows the moves, the result in points and the word for it", () => {
    const line = ideaLine(idea({ id: "a", companyName: "Acme" }), score({ ideaId: "a", ideaReturn: 0.123, indexReturn: 0.05, excess: 0.073, holdingDays: 40 }), [], false);
    expect(line).toMatchObject({
      state: "figures", name: "Acme", entryDate: "2026-01-06", markDate: "2026-06-02", daysHeld: 40,
      shareMove: "+12.3%", indexMove: "+5.0%", result: "+7.3 pp", resultWord: "as expected", headline: null,
    });
  });

  it("an idea that expects to do worse shows its direction in words and a positive result still means the call was right", () => {
    const line = ideaLine(idea({ id: "a", expects: "underperform" }), score({ ideaId: "a", ideaReturn: -0.1, indexReturn: 0.02, excess: 0.12 }), [], false);
    expect(line.expectsText).toBe("Expects to do worse than the Nifty 50");
    expect(line).toMatchObject({ shareMove: "−10.0%", indexMove: "+2.0%", result: "+12.0 pp", resultWord: "as expected" });
  });

  it("level is not as expected", () => {
    expect(ideaLine(idea({ id: "a" }), score({ ideaId: "a", excess: 0 }), [], false)).toMatchObject({ result: "0.0 pp", resultWord: "not as expected" });
  });

  it("a flagged idea shows the flag's sentence in place of its result, and no figure", () => {
    const line = ideaLine(idea({ id: "a" }), score({ ideaId: "a", flags: ["jump", "stale"], excess: 0.4, ideaReturn: 0.5 }), [], false);
    expect(line).toMatchObject({ state: "check", headline: "Needs a check: the price moved sharply. Was there a split or bonus?", result: null, shareMove: null, indexMove: null });
    expect(line.marks.map((m) => m.key)).toEqual(["stale"]);
  });

  it("an idea with no entry close yet is waiting and says so in place of a result", () => {
    const line = ideaLine(idea({ id: "a" }), score({ ideaId: "a", entryDate: null, entryClose: null, excess: null, ideaReturn: null, indexReturn: null, flags: ["entry_pending"] }), [], false);
    expect(line).toMatchObject({ state: "waiting", headline: "Entry will be set at the next close.", result: null, entryDate: null });
    expect(line.marks).toEqual([]);
  });

  it("an open idea whose entry close is in but not yet held a day waits, saying which close set the entry", () => {
    for (const holdingDays of [0, null]) {
      const line = ideaLine(idea({ id: "a" }), score({ ideaId: "a", entryDate: "2026-10-13", markDate: "2026-10-13", ideaReturn: 0, indexReturn: 0, excess: 0, holdingDays }), [], false);
      expect(line).toMatchObject({ state: "waiting", headline: "Entry: close of 13 Oct 2026. The first result appears after the next close.", result: null });
    }
  });

  it("a closed idea held for no days still shows its figures", () => {
    expect(ideaLine(closedIdea({ id: "a" }), finalScore({ ideaId: "a", holdingDays: 0, excess: 0, ideaReturn: 0, indexReturn: 0 }), [], false).state).toBe("figures");
  });

  it("an idea with no score row is waiting", () => {
    expect(ideaLine(idea({ id: "a" }), null, [], false)).toMatchObject({ state: "waiting", headline: "Entry will be set at the next close." });
  });

  it("a closed idea whose exit is not fixed shows its figures with the exit note", () => {
    const line = ideaLine(closedIdea({ id: "a", processCall: null }), score({ ideaId: "a", flags: ["exit_pending"] }), [], false);
    expect(line.state).toBe("figures");
    expect(line.marks.map((m) => m.text)).toEqual(["Exit will be set at the next close."]);
    expect(line.lesson).toBe("missing");
  });

  it("a closed idea shows the reason, the date and whether a lesson is written", () => {
    const written = ideaLine(closedIdea({ id: "a", closeReason: "thesis_broken", processCall: "flawed" }), finalScore({ ideaId: "a" }), [], false);
    expect(written).toMatchObject({ closeReasonText: "Thesis broken", closedOn: "2026-06-01", lesson: "written", processText: "Process was flawed", isFinal: true });
    expect(ideaLine(idea({ id: "b" }), score({ ideaId: "b" }), [], false).lesson).toBeNull();
  });

  it("carries every mark and the restatements of this idea", () => {
    const line = ideaLine(
      idea({ id: "a" }),
      score({ ideaId: "a", flags: ["hand_price", "attested"], entrySkippedDays: 1 }),
      [change({ ideaId: "a", id: 2 })],
      true,
    );
    expect(line.marks.map((m) => m.key)).toEqual(["hand_price", "attested", "entry_late"]);
    expect(line.restated).toHaveLength(1);
    expect(line.pastHorizon).toBe(true);
  });

  it("prints the horizon and the day it ends", () => {
    const line = ideaLine(idea({ id: "a", horizonDays: 365, openedAt: "2026-01-05T05:00:00.000Z" }), null, [], false);
    expect(line.horizonText).toBe("1 year");
    expect(line.horizonEnds).toBe("2027-01-05");
  });
});

describe("eventLine: his words as typed, his choices as labels, the seal beside them", () => {
  it("keeps the text exactly, including spaces and line breaks", () => {
    const text = "  I think this is cheap.\n\n  Second paragraph  \n";
    const line = eventLine(event({ id: "e", ideaId: "a", seq: 3, kind: "note", bodyMd: text, hash: "abcdef0123456789" }));
    expect(line.body).toBe(text);
    expect(line.hashShort).toBe("abcdef01");
    expect(line.kindText).toBe("Note");
  });

  it("shows the choices on the entries that carry them", () => {
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 1, kind: "open", stance: { expects: "underperform", horizon_days: 365, held: false, benchmark: "NIFTY 50" } })).choices)
      .toEqual(["Expects to do worse than the Nifty 50", "Horizon: 1 year", "You hold no position"]);
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 2, kind: "close", stance: { reason: "better_use" } })).choices).toEqual(["Reason: Better use of the money"]);
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 3, kind: "review", stance: { process: "sound", tags: ["timing", "luck"] } })).choices)
      .toEqual(["Process was sound", "Tags: Timing, Luck"]);
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 4, kind: "revise", stance: { horizon_days: 730 } })).choices).toEqual(["Horizon: 730 days"]);
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 5, kind: "downsize", stance: { held: true } })).choices).toEqual(["You still hold some"]);
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 6, kind: "note", stance: {} })).choices).toEqual([]);
  });

  it("ignores a choice it does not know rather than printing it", () => {
    expect(eventLine(event({ id: "e", ideaId: "a", seq: 1, kind: "close", stance: { reason: "<b>x</b>" } })).choices).toEqual([]);
  });

  it("never puts a number of the machine's inside his text or among his choices", () => {
    const line = eventLine(event({ id: "e", ideaId: "a", seq: 1, kind: "note", bodyMd: "Words only." }));
    expect(Object.keys(line).sort()).toEqual(["body", "choices", "hashShort", "id", "kind", "kindText", "recordedAt", "seq"]);
  });
});

describe("needsYou: ideas the owner has to look at, listed and not hidden", () => {
  const ideas = [
    idea({ id: "flag", companyName: "Flagged Ltd" }),
    closedIdea({ id: "nolesson", companyName: "Silent Ltd", processCall: null }),
    idea({ id: "late", companyName: "Late Ltd", horizonDays: 365, openedAt: "2025-01-05T05:00:00.000Z" }),
  ];
  const summary = { needsCheck: ["flag"], noLesson: ["nolesson"], pastHorizon: ["late"] };

  it("makes one card per problem with a plain sentence and the idea to open", () => {
    const cards = needsYou(ideas, [score({ ideaId: "flag", flags: ["implausible"] })], summary);
    expect(cards.map((c) => [c.kind, c.ideaId, c.name])).toEqual([["check", "flag", "Flagged Ltd"], ["lesson", "nolesson", "Silent Ltd"], ["horizon", "late", "Late Ltd"]]);
    expect(cards[0]!.body).toBe("Needs a check: the return is too large to be believed.");
    expect(cards[1]!.body).toBe("Closed 1 Jun 2026. Write what you learned while it is fresh.");
    expect(cards[2]!.body).toBe("Its horizon of 1 year ended on 5 Jan 2026. Close the idea or revise the horizon.");
  });

  it("is empty when nothing needs a look", () => {
    expect(needsYou(ideas, [], { needsCheck: [], noLesson: [], pastHorizon: [] })).toEqual([]);
  });
});
