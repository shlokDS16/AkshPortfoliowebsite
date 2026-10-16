// Plan 5a (spec s4.4): the slot budgets of a share card and the cut that keeps his words inside them. Split from seo.ts to keep it small.

export const TITLE_BUDGET = 72;
export const OBJECTIVE_BUDGET = 120;

/**
 * At most `max` characters (code points): text over the budget is cut on a word boundary and ends with "…", so a card slot never
 * overflows and his words are never re-worded. A single word longer than the budget is cut by characters.
 */
export function cutWords(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const room = chars.slice(0, max - 1);
  const space = room.lastIndexOf(" ");
  const end = chars[room.length] === " " || space <= 0 ? room.length : space;
  return `${room.slice(0, end).join("").replace(/[\s,;:]+$/, "")}…`;
}
