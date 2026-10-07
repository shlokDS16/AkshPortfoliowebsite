/** `match` comes from the gate's folded text, so it may not occur verbatim: split around it when it does, else null. */
export function splitAtMatch(text: string, match: string | null): { before: string; hit: string; after: string } | null {
  const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (!match || at < 0) return null;
  return { before: text.slice(0, at), hit: text.slice(at, at + match.length), after: text.slice(at + match.length) };
}
