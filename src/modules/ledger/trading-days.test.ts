import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { datesToFetch, FETCH_WINDOW_DAYS, isWeekday, lastOpenDate, weekdaysBehind, type MarketDayRow } from "./trading-days";

// 2026-10-12 is a Monday. Rows: a date is "decided" only when its source is nse_fetch (spec s18).
const open = (tradeDate: string, source = "nse_fetch"): MarketDayRow => ({ tradeDate, status: "open", source });
const shut = (tradeDate: string, source = "nse_fetch"): MarketDayRow => ({ tradeDate, status: "shut", source });
/** Open official rows for every weekday from `first` to `last`, inclusive. */
const run = (first: string, last: string): MarketDayRow[] => {
  const rows: MarketDayRow[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) if (isWeekday(d)) rows.push(open(d));
  return rows;
};

describe("isWeekday", () => {
  it("is true Monday to Friday and false on the weekend and for text that is not a date", () => {
    expect(["2026-10-09", "2026-10-12", "2026-10-16"].map(isWeekday)).toEqual([true, true, true]);
    expect(["2026-10-10", "2026-10-11"].map(isWeekday)).toEqual([false, false]);
    expect(isWeekday("2026-02-30")).toBe(false);
    expect(isWeekday("yesterday")).toBe(false);
  });
});

describe("datesToFetch", () => {
  it("is yesterday alone on an ordinary morning, and never today", () => {
    expect(datesToFetch(run("2026-10-07", "2026-10-12"), "2026-10-14")).toEqual(["2026-10-13"]);
    expect(datesToFetch(run("2026-10-07", "2026-10-13"), "2026-10-14")).toEqual([]);
  });

  it("skips a weekend: Monday morning asks for Friday only", () => {
    expect(datesToFetch(run("2026-10-05", "2026-10-08"), "2026-10-12")).toEqual(["2026-10-09"]);
  });

  it("asks oldest first, and still asks for a weekday that sits before a later open day (a holiday not yet decided)", () => {
    expect(datesToFetch([...run("2026-10-07", "2026-10-12"), open("2026-10-14")], "2026-10-15")).toEqual(["2026-10-13"]);
    expect(datesToFetch(run("2026-10-07", "2026-10-12"), "2026-10-15")).toEqual(["2026-10-13", "2026-10-14"]);
  });

  it("treats a date as decided only when the official fetch decided it (open or shut)", () => {
    const days = [...run("2026-10-07", "2026-10-09"), open("2026-10-12", "manual"), open("2026-10-13", "nse_upload"), shut("2026-10-14")];
    expect(datesToFetch(days, "2026-10-15")).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("looks back no further than seven days", () => {
    expect(FETCH_WINDOW_DAYS).toBe(7);
    // today Wed 21 Oct: the window is 14 Oct (Wed) to 20 Oct (Tue); Mon 12 and Tue 13 are older than that.
    expect(datesToFetch([], "2026-10-21")).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"]);
  });

  it("is empty when every weekday in the window is decided", () => {
    const days = [open("2026-10-12"), shut("2026-10-13"), open("2026-10-14"), open("2026-10-15"), open("2026-10-16")];
    expect(datesToFetch(days, "2026-10-17")).toEqual([]);
  });
});

describe("weekdaysBehind", () => {
  it("is 0 when yesterday's close is stored, and for a Monday that follows Friday's close", () => {
    expect(weekdaysBehind([open("2026-10-13")], "2026-10-14")).toBe(0);
    expect(weekdaysBehind([open("2026-10-09")], "2026-10-12")).toBe(0);
  });

  it("counts weekdays since the last open day, today excluded, weekends skipped", () => {
    expect(weekdaysBehind([open("2026-10-09")], "2026-10-13")).toBe(1); // Mon 12th is missing
    expect(weekdaysBehind([open("2026-10-09")], "2026-10-15")).toBe(3); // 12th, 13th, 14th
  });

  it("does not count a weekday that is decided as shut", () => {
    expect(weekdaysBehind([open("2026-10-09"), shut("2026-10-12")], "2026-10-14")).toBe(1);
  });

  it("measures a week-long outage in weekdays, not calendar days", () => {
    expect(weekdaysBehind([open("2026-10-02")], "2026-10-12")).toBe(5);
  });

  it("counts a hand-entered open day as a stored close", () => {
    expect(weekdaysBehind([open("2026-10-09"), open("2026-10-13", "manual")], "2026-10-14")).toBe(0);
  });

  it("with no open day on record, counts the weekdays of the fetch window", () => {
    expect(weekdaysBehind([], "2026-10-14")).toBe(5);
    expect(weekdaysBehind([shut("2026-10-12")], "2026-10-14")).toBe(4);
  });
});

describe("lastOpenDate", () => {
  it("is the newest open date before today, or null", () => {
    expect(lastOpenDate([open("2026-10-09"), shut("2026-10-12"), open("2026-10-13")], "2026-10-14")).toBe("2026-10-13");
    expect(lastOpenDate([open("2026-10-14")], "2026-10-14")).toBeNull();
    expect(lastOpenDate([], "2026-10-14")).toBeNull();
  });
});
