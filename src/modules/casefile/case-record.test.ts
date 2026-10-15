import { describe, expect, it } from "vitest";
import { caseRecordFixture, FIXTURE_CHART } from "@/test/fixtures/case-record";
import {
  CASE_CLOSE_REASON_LABEL, expectationSentence, horizonPhrase, isLedgerCase, mistakeTagsSentence,
  parseCaseRecord, PUBLIC_FINGERPRINT_FILE,
} from "./case-record";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Loose = Record<string, unknown> & { events: Record<string, unknown>[]; chart: { points: Record<string, unknown>[] } | null };
const loose = (patch?: Record<string, unknown>): Loose => ({ ...clone(caseRecordFixture()), ...patch }) as Loose;

describe("parseCaseRecord", () => {
  it("accepts the builder's record and returns it as is", () => {
    const record = clone(caseRecordFixture());
    expect(parseCaseRecord(record)).toEqual(record);
  });

  it("accepts keys in any order (jsonb does not keep the builder's order)", () => {
    const record = clone(caseRecordFixture());
    const reversed = Object.fromEntries(Object.entries(record).reverse());
    expect(parseCaseRecord(reversed)).toEqual(record);
  });

  it("accepts a chart", () => {
    const record = clone(caseRecordFixture({ chart: FIXTURE_CHART }));
    expect(parseCaseRecord(record)?.chart?.points).toHaveLength(3);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["an array", []],
    ["version 2", loose({ v: 2 })],
    [
      "a missing key",
      (() => {
        const r = loose();
        delete r.process;
        return r;
      })(),
    ],
    ["an unknown key", loose({ extra: 1 })],
    ["a bad idea id", loose({ idea: "nope" })],
    ["a bad direction", loose({ expects: "buy" })],
    ["a bad close reason", loose({ close_reason: "stopped_out" })],
    ["a bad process call", loose({ process: "good" })],
    ["an unknown tag", loose({ tags: ["timing", "bad-luck"] })],
    ["tags that are not an array", loose({ tags: "timing" })],
    ["a date that is not ISO", loose({ entry_date: "13/01/2026" })],
    ["a date that does not exist", loose({ exit_date: "2026-02-30" })],
    ["a figures-to that is not a date", loose({ figures_to: null })],
    ["a horizon below 30", loose({ horizon_days: 7 })],
    ["a fractional holding period", loose({ holding_days: 1.5 })],
    ["no events", loose({ events: [] })],
    ["events that are not an array", loose({ events: {} })],
    ["an unknown chart key", loose({ chart: { points: [], extra: 1 } })],
  ])("refuses %s", (_name, value) => {
    expect(parseCaseRecord(value)).toBeNull();
  });

  describe("events", () => {
    const withEvent = (edit: (e: Record<string, unknown>[]) => void) => {
      const record = loose();
      edit(record.events);
      return record;
    };
    it.each([
      ["a hash that is not 64 lowercase hex", (e: Record<string, unknown>[]) => { e[0].hash = "ABC"; }],
      ["a hash with capitals", (e: Record<string, unknown>[]) => { e[0].hash = String(e[0].hash).toUpperCase(); }],
      ["a previous hash of the wrong length", (e: Record<string, unknown>[]) => { e[1].prev_hash = "ab"; }],
      ["a kind that is not revealed (note)", (e: Record<string, unknown>[]) => { e[1].kind = "note"; }],
      ["a missing canonical text", (e: Record<string, unknown>[]) => { delete e[0].canonical; }],
      ["words that are not text", (e: Record<string, unknown>[]) => { e[0].words = 4; }],
      ["a sealed time that is not a UTC time", (e: Record<string, unknown>[]) => { e[0].at = "2026-01-12"; }],
      ["a listed-on that is not a date", (e: Record<string, unknown>[]) => { e[0].listed_on = "yesterday"; }],
      ["a sequence that does not rise", (e: Record<string, unknown>[]) => { e[1].seq = 41; }],
      ["a first entry that is not the open", (e: Record<string, unknown>[]) => { e[0].kind = "revise"; }],
      ["an unknown event key", (e: Record<string, unknown>[]) => { e[0].extra = true; }],
      ["a stance that is not an object", (e: Record<string, unknown>[]) => { e[0].stance = "x"; }],
    ])("refuses %s", (_name, edit) => {
      expect(parseCaseRecord(withEvent(edit))).toBeNull();
    });

    it("accepts a listed-on date", () => {
      const record = withEvent((e) => { e[0].listed_on = "2026-01-14"; });
      expect(parseCaseRecord(record)?.events[0]?.listed_on).toBe("2026-01-14");
    });

    it("refuses more than 200 entries", () => {
      const record = loose();
      const last = record.events[3] as Record<string, unknown>;
      record.events = [record.events[0] as Record<string, unknown>, ...Array.from({ length: 200 }, (_, i) => ({ ...last, kind: "review", seq: 100 + i }))];
      expect(parseCaseRecord(record)).toBeNull();
    });
  });

  describe("chart", () => {
    it("refuses more than 600 points", () => {
      const points = Array.from({ length: 601 }, (_, i) => ({ d: "2026-01-13", share: 100 + i, index: 100 }));
      expect(parseCaseRecord(loose({ chart: { points } }))).toBeNull();
    });
    it("accepts exactly 600 points", () => {
      const points = Array.from({ length: 600 }, () => ({ d: "2026-01-13", share: 100, index: 100 }));
      expect(parseCaseRecord(loose({ chart: { points } }))?.chart?.points).toHaveLength(600);
    });
    it.each([
      ["a point date that is not a date", { d: "x", share: 100, index: 100 }],
      ["a share that is not a number", { d: "2026-01-13", share: "100", index: 100 }],
      ["an index that is not finite", { d: "2026-01-13", share: 100, index: null }],
      ["a point with an extra key", { d: "2026-01-13", share: 100, index: 100, volume: 1 }],
    ])("refuses %s", (_name, point) => {
      expect(parseCaseRecord(loose({ chart: { points: [point] } }))).toBeNull();
    });
  });
});

describe("isLedgerCase", () => {
  it("is true when the structured data has a ledger key, whatever it holds", () => {
    expect(isLedgerCase({ ledger: {} })).toBe(true);
    expect(isLedgerCase({ ledger: null })).toBe(true);
  });
  it("is false for anything else", () => {
    expect(isLedgerCase({})).toBe(false);
    expect(isLedgerCase({ facts: [] })).toBe(false);
    expect(isLedgerCase(null)).toBe(false);
    expect(isLedgerCase("ledger")).toBe(false);
    expect(isLedgerCase([{ ledger: 1 }])).toBe(false);
  });
});

describe("the public labels", () => {
  it("use the wording of spec s33.5", () => {
    expect(CASE_CLOSE_REASON_LABEL).toEqual({
      played_out: "played out", thesis_broken: "thesis broken", horizon_reached: "period reached", better_use: "a better use for the money", other: "other",
    });
  });
  it("name the horizon", () => {
    expect(horizonPhrase(182)).toBe("6 months");
    expect(horizonPhrase(365)).toBe("1 year");
    expect(horizonPhrase(1095)).toBe("3 years");
    expect(horizonPhrase(730)).toBe("2 years");
    expect(horizonPhrase(100)).toBe("100 days");
  });
  it("say what he expected", () => {
    expect(expectationSentence("Kaveri Seed", "outperform", 365)).toBe("Expected Kaveri Seed to do better than the Nifty 50 over 1 year.");
    expect(expectationSentence("Kaveri Seed", "underperform", 182)).toBe("Expected Kaveri Seed to do worse than the Nifty 50 over 6 months.");
  });
  it("list the kinds of mistake he named, or say he named none", () => {
    expect(mistakeTagsSentence(["timing", "valuation"])).toBe("Kinds of mistake he named: timing, valuation.");
    expect(mistakeTagsSentence(["none"])).toBe("He named no mistake.");
    expect(mistakeTagsSentence([])).toBe("He named no mistake.");
    expect(mistakeTagsSentence(["none", "luck"])).toBe("Kinds of mistake he named: luck.");
  });
});

describe("the public copy of the fingerprints", () => {
  it("is not switched on in this build (Q26)", () => {
    expect(PUBLIC_FINGERPRINT_FILE).toBeNull();
  });
});
