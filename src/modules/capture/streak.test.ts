import { describe, expect, it } from "vitest";
import { captureStreak } from "./streak";

describe("captureStreak", () => {
  it("counts captures per day over the last 30 days ending today", () => {
    const streak = captureStreak(["2026-10-04", "2026-10-04", "2026-10-02", "2026-09-05", "2026-09-04"], "2026-10-04");
    expect(streak.days).toHaveLength(30);
    expect(streak.days[0].date).toBe("2026-09-05");
    expect(streak.days[29]).toEqual({ date: "2026-10-04", count: 2 });
    expect(streak.activeDays).toBe(3); // 2026-09-04 is outside the window
    expect(streak.windowDays).toBe(30);
  });

  it("is all zeros with no captures, and honours a custom window", () => {
    const empty = captureStreak([], "2026-10-04", 7);
    expect(empty.days).toHaveLength(7);
    expect(empty.activeDays).toBe(0);
    expect(empty.windowDays).toBe(7);
  });
});
