import { describe, expect, it } from "vitest";
import { addDays, istDate, istDateTime, istDayStartUtc } from "./dates";

describe("dates", () => {
  it("gives the calendar date in India", () => {
    expect(istDate("2026-10-04T19:00:00Z")).toBe("2026-10-05"); // 00:30 IST next day
    expect(istDate("2026-10-04T18:00:00Z")).toBe("2026-10-04"); // 23:30 IST
  });

  it("formats a timestamp as India time to the minute, on a 24-hour clock", () => {
    expect(istDateTime("2026-10-04T19:00:00Z")).toBe("2026-10-05 00:30 IST");
    expect(istDateTime("2026-10-04T18:29:59Z")).toBe("2026-10-04 23:59 IST");
    expect(istDateTime("2026-10-04T18:30:00Z")).toBe("2026-10-05 00:00 IST"); // midnight is 00, never 24
    expect(istDateTime("2026-10-04T06:45:00+00:00")).toBe("2026-10-04 12:15 IST");
  });

  it("adds and subtracts days across month ends", () => {
    expect(addDays("2026-10-04", -30)).toBe("2026-09-04");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("returns midnight IST as a UTC timestamp", () => {
    expect(istDayStartUtc("2026-10-04")).toBe("2026-10-03T18:30:00.000Z");
  });
});
