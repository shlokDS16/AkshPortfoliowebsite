import { describe, expect, it } from "vitest";
import { captureStreak } from "./streak";
import { toStreakData } from "./streak-view";

describe("toStreakData", () => {
  it("turns the 30-day streak into cells, a count and the last entry (counts only)", () => {
    const data = toStreakData(captureStreak(["2026-10-05", "2026-10-01", "2026-10-05"], "2026-10-06"));
    expect(data.cells).toHaveLength(30);
    expect(data.cells.filter(Boolean)).toHaveLength(2);
    expect(data.daysLogged).toBe(2);
    expect(data.lastEntry).toBe("2026-10-05");
    expect(toStreakData(captureStreak([], "2026-10-06"))).toMatchObject({ daysLogged: 0, lastEntry: null });
  });
});
