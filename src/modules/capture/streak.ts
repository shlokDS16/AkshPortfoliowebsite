import { addDays } from "@/lib/dates";

export type Streak = { days: { date: string; count: number }[]; activeDays: number; windowDays: number };

/** Counts only, never content (spec s7). `dates` are IST calendar dates (YYYY-MM-DD). */
export function captureStreak(dates: string[], today: string, windowDays = 30): Streak {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  const days = Array.from({ length: windowDays }, (_, index) => {
    const date = addDays(today, index - (windowDays - 1));
    return { date, count: counts.get(date) ?? 0 };
  });
  return { days, activeDays: days.filter((d) => d.count > 0).length, windowDays };
}
