import type { StreakData } from "@/lib/view-types";
import type { Streak } from "./streak";

/** Counts only (segment 2): which of the last 30 days had a capture, and the last one. */
export function toStreakData(streak: Streak): StreakData {
  const days = [...streak.days].sort((a, b) => a.date.localeCompare(b.date));
  const logged = days.filter((d) => d.count > 0);
  return { cells: days.map((d) => d.count > 0), daysLogged: streak.activeDays, lastEntry: logged.at(-1)?.date ?? null };
}
