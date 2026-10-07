/**
 * True when a revision body is the captured text itself, or ends with it as an appended block
 * (appendRevision joins with a blank line). Never a plain substring: "ok" or "buy" sit inside unrelated text.
 */
export function bodyHoldsText(body: string, text: string): boolean {
  const wanted = text.trim();
  if (wanted === "") return false;
  const have = body.trim();
  return have === wanted || have.endsWith(`\n\n${wanted}`);
}
