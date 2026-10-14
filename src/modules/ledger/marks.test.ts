import { describe, expect, it } from "vitest";
import { restatements, scoreMarks } from "./marks";
import { change, score } from "./test-fixtures";

const keys = (marks: { key: string }[]) => marks.map((m) => m.key);

describe("scoreMarks: every mark that changes how a score is read is shown", () => {
  it("says the entry is waiting when there is no score at all", () => {
    expect(scoreMarks(null)).toEqual([{ key: "entry_pending", text: "Entry will be set at the next close.", check: false }]);
  });

  it("shows each flag in its own words, the ones that need a check first", () => {
    const marks = scoreMarks(score({ ideaId: "a", flags: ["stale", "attested", "hand_price", "jump"] }));
    expect(keys(marks)).toEqual(["jump", "hand_price", "attested", "stale"]);
    expect(marks[0]).toMatchObject({ check: true, text: "Needs a check: the price moved sharply. Was there a split or bonus?" });
    expect(marks[1]!.text).toBe("Includes a close that was entered by hand.");
    expect(marks[2]!.text).toBe("Includes a split, bonus or note about a price move that you entered by hand.");
    expect(marks[3]!.text).toBe("The latest close is three or more weekdays old.");
    expect(marks.slice(1).every((m) => !m.check)).toBe(true);
  });

  it("shows implausible and an ISIN change as checks", () => {
    const marks = scoreMarks(score({ ideaId: "a", flags: ["implausible", "isin_changed"] }));
    expect(marks.every((m) => m.check)).toBe(true);
    expect(marks.map((m) => m.text)).toEqual(["Needs a check: the return is too large to be believed.", "Needs a check: the share's identity code changed."]);
  });

  it("treats a flag this build does not know as a check, with the plain sentence", () => {
    const marks = scoreMarks(score({ ideaId: "a", flags: ["from_the_future" as never] }));
    expect(marks).toEqual([{ key: "from_the_future", text: "Needs a check.", check: true }]);
  });

  it("names the days an entry or an exit was taken late", () => {
    const marks = scoreMarks(score({ ideaId: "a", entrySkippedDays: 2, exitSkippedDays: 1 }));
    expect(marks.map((m) => m.text)).toEqual([
      "Entry taken 2 trading days late: the share had no close on the days before it.",
      "Exit taken 1 trading day late: the share had no close on the days before it.",
    ]);
  });

  it("shows nothing for zero or missing skipped days and for a clean score", () => {
    expect(scoreMarks(score({ ideaId: "a", entrySkippedDays: 0, exitSkippedDays: null }))).toEqual([]);
  });

  it("shows the pending flags as plain notes, not checks", () => {
    const marks = scoreMarks(score({ ideaId: "a", flags: ["exit_pending"] }));
    expect(marks).toEqual([{ key: "exit_pending", text: "Exit will be set at the next close.", check: false }]);
  });
});

describe("restatements: the log is shown with the old and the new figure", () => {
  it("names the date and each field that moved, with the figure it had and the figure it has", () => {
    const [r] = restatements([
      change({
        ideaId: "a",
        id: 4,
        changedAt: "2026-10-10T00:30:00.000Z",
        changed: ["entry_close", "excess", "mark_date"],
        was: { entry_close: 100, excess: 0.05, mark_date: "2026-10-01" },
        became: { entry_close: 102.5, excess: -0.0125, mark_date: "2026-10-02" },
      }),
    ]);
    expect(r).toEqual({
      id: 4,
      headline: "Restated on 10 Oct 2026.",
      lines: ["Entry close: was 100.00, now 102.50.", "Result for the call: was +5.0 pp, now −1.3 pp.", "Marked on: was 1 Oct 2026, now 2 Oct 2026."],
    });
  });

  it("keeps the order the log was given (newest first)", () => {
    const list = restatements([change({ ideaId: "a", id: 9 }), change({ ideaId: "a", id: 3 })]);
    expect(list.map((r) => r.id)).toEqual([9, 3]);
  });

  it("says 'another part changed' for a field it has no words for, once, and never raw text (task 10 review M5)", () => {
    const [r] = restatements([
      change({ ideaId: "a", changed: ["flags", "entry_source"], was: { flags: ["x"], entry_source: "SECRET" }, became: { flags: [], entry_source: "DB TEXT" } }),
    ]);
    expect(r!.lines).toEqual(["Another part of the score changed."]);
    expect(JSON.stringify(r)).not.toMatch(/SECRET|DB TEXT/);
  });

  it("says a withdrawn idea's score was removed", () => {
    const [r] = restatements([change({ ideaId: "a", changed: ["void"], was: {}, became: { void: true } })]);
    expect(r!.lines).toEqual(["The idea was withdrawn, so its score was removed."]);
  });

  it("prints a missing figure as none", () => {
    const [r] = restatements([change({ ideaId: "a", changed: ["mark_close"], was: { mark_close: null }, became: { mark_close: 99 } })]);
    expect(r!.lines).toEqual(["Latest close: was none, now 99.00."]);
  });
});
