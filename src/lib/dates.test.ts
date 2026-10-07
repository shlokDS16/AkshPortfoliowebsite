import { describe, expect, it } from "vitest";
import { addDays, istDate, istDateTime, istDayStartUtc, isPastLag, istTime, PUBLICATION_LAG_DAYS } from "./dates";

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

  it("gives the time in India to the minute", () => {
    expect(istTime("2026-10-04T08:35:00Z")).toBe("14:05");
  });

  it("adds and subtracts days across month ends", () => {
    expect(addDays("2026-10-04", -30)).toBe("2026-09-04");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("counts the 30-day publication lag on the India calendar, inclusive, like private.is_lagged() in SQL", () => {
    expect(PUBLICATION_LAG_DAYS).toBe(30);
    expect(isPastLag("2026-09-04", "2026-10-04")).toBe(true); // exactly 30 days
    expect(isPastLag("2026-09-05", "2026-10-04")).toBe(false); // 29 days
    expect(isPastLag("2026-08-01", "2026-10-04")).toBe(true);
  });

  it("takes 'today' as the IST date, so 19:00 UTC already counts the next day (the SQL boundary)", () => {
    const today = istDate("2026-10-04T19:00:00Z"); // 00:30 IST on 5 October
    expect(isPastLag("2026-09-05", today)).toBe(true);
    expect(isPastLag("2026-09-05", istDate("2026-10-04T18:00:00Z"))).toBe(false); // 23:30 IST on 4 October
  });

  it("returns midnight IST as a UTC timestamp", () => {
    expect(istDayStartUtc("2026-10-04")).toBe("2026-10-03T18:30:00.000Z");
  });
});
