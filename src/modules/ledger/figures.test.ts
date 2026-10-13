import { describe, expect, it } from "vitest";
import { formatClose, formatMove, formatPoints, horizonText, voidDeadline } from "./figures";

describe("figures", () => {
  it("prints moves and the result with one decimal, a sign and the desk's minus", () => {
    expect(formatMove(0.123)).toBe("+12.3%");
    expect(formatMove(-0.05)).toBe("−5.0%");
    expect(formatPoints(0.042)).toBe("+4.2 pp");
    expect(formatPoints(-0.0125)).toBe("−1.3 pp");
  });
  it("never prints a signed zero", () => {
    expect(formatMove(0)).toBe("0.0%");
    expect(formatMove(-0.00004)).toBe("0.0%");
    expect(formatPoints(0.00001)).toBe("0.0 pp");
  });
  it("groups large figures the Indian way", () => {
    expect(formatMove(12.345)).toBe("+1,234.5%");
    expect(formatClose(1234567.5)).toBe("12,34,567.50");
    expect(formatClose(100)).toBe("100.00");
  });
  it("names the three horizons and prints any other as days", () => {
    expect(horizonText(182)).toBe("6 months");
    expect(horizonText(365)).toBe("1 year");
    expect(horizonText(1095)).toBe("3 years");
    expect(horizonText(400)).toBe("400 days");
  });
});

describe("voidDeadline mirrors the database rule", () => {
  // 09:00 India (03:30Z) -> 15:00 the same day (09:30Z), earlier than 24 h.
  it("sealed before 15:00 India: that day at 15:00", () => {
    expect(voidDeadline("2026-10-13T03:30:00Z").toISOString()).toBe("2026-10-13T09:30:00.000Z");
  });
  // 16:00 India (10:30Z) -> next day 15:00 India (09:30Z next day) = 23 h later, earlier than 24 h.
  it("sealed after 15:00 India: the next day at 15:00", () => {
    expect(voidDeadline("2026-10-13T10:30:00Z").toISOString()).toBe("2026-10-14T09:30:00.000Z");
  });
  // 23:30 India (18:00Z) -> next day 15:00 India = 15.5 h later.
  it("sealed late in the evening: still the next day at 15:00", () => {
    expect(voidDeadline("2026-10-13T18:00:00Z").toISOString()).toBe("2026-10-14T09:30:00.000Z");
  });
  // 00:30 India on the 14th = 19:00Z on the 13th: the cutoff is the 14th, 15:00 India.
  it("sealed just after India midnight: that day at 15:00", () => {
    expect(voidDeadline("2026-10-13T19:00:00Z").toISOString()).toBe("2026-10-14T09:30:00.000Z");
  });
  it("is never more than 24 hours after the seal", () => {
    const sealed = "2026-10-13T09:29:00Z"; // 14:59 India
    expect(voidDeadline(sealed).getTime() - new Date(sealed).getTime()).toBeLessThanOrEqual(24 * 3_600_000);
  });
});
