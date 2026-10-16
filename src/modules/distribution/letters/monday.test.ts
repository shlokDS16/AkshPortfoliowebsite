import { describe, expect, it } from "vitest";
import { mondayLine } from "./monday";

// 2026-10-19 is a Monday in India. 19:00 UTC on the Sunday is already Monday 00:30 there.
const MONDAY = new Date("2026-10-19T05:00:00Z");
const SUNDAY_NIGHT_UTC = new Date("2026-10-18T19:00:00Z");
const TUESDAY = new Date("2026-10-20T05:00:00Z");
const MONDAY_LATE_UTC = new Date("2026-10-19T19:00:00Z"); // Tuesday 00:30 in India

describe("the Monday line on the desk home (spec s8.1)", () => {
  it("says the count on a Monday in India when at least one change is waiting", () => {
    expect(mondayLine(MONDAY, 3)).toBe("Letter: 3 changes since your last letter.");
    expect(mondayLine(MONDAY, 1)).toBe("Letter: 1 change since your last letter.");
  });

  it("uses the India day, not the UTC day", () => {
    expect(mondayLine(SUNDAY_NIGHT_UTC, 2)).toBe("Letter: 2 changes since your last letter.");
    expect(mondayLine(MONDAY_LATE_UTC, 2)).toBeNull();
  });

  it("is absent on any other day and when nothing is waiting", () => {
    expect(mondayLine(TUESDAY, 5)).toBeNull();
    expect(mondayLine(MONDAY, 0)).toBeNull();
  });
});
