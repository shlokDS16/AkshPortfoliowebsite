// Length helpers that count UTF-16 units, because that is what zod's .max() counts. Code-point counts
// would let an emoji-heavy line pass here and then fail the research schema.

/** A cut index that never lands between the halves of a surrogate pair. */
function safeCut(text: string, index: number): number {
  const high = index > 0 ? text.charCodeAt(index - 1) : 0;
  return high >= 0xd800 && high <= 0xdbff ? index - 1 : index;
}

/** At most `max` UTF-16 units, no ellipsis. */
export function clipUnits(text: string, max: number): string {
  return text.length > max ? text.slice(0, safeCut(text, max)) : text;
}

/** At most `max` UTF-16 units including the trailing "..." when something was cut. */
export function truncateUnits(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, safeCut(text, max - 3)).trimEnd()}...` : text;
}
