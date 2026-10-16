import { istWeekday } from "@/lib/dates";
import { formatCount } from "@/lib/format";

// The desk home's prompt (spec s8.1, D84): on a Monday in India, when something public is not yet in a sent letter. It is a prompt, not a
// schedule: nothing public says "weekly", and no step writes a draft. The count is computed by the caller from the public snapshot.

export const isMondayInIndia = (now: Date): boolean => istWeekday(now) === "Mon";

export function mondayLine(now: Date, changes: number): string | null {
  if (!isMondayInIndia(now) || changes < 1) return null;
  return `Letter: ${formatCount(changes, "change")} since your last letter.`;
}
