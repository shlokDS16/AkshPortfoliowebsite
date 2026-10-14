// What a re-read replaces and what it leaves alone (Plan 2b Task 8, fix round 1). A re-read is Aksh's click: it rejects the page's rows
// he had not checked and marks them `superseded`, so they can be told apart from the figures he dropped himself. Pure; shared by the
// review list, the readings list and the inbox's counts, so the card and the review say the same number.

/** The pass a proposal was made in: a re-read files its rows under `<key>|r<n>`. */
export const passOf = (dedupeKey: string): number => Number(/\|r(\d)$/.exec(dedupeKey)?.[1] ?? 1);

/** The key without the re-read suffix: the same line on any pass. */
export const baseKeyOf = (dedupeKey: string): string => dedupeKey.replace(/\|r\d$/, "");

export type PassRow = { key: string; pass: number; status: string; superseded: boolean };

/**
 * The rows still in play. A row the re-read replaced (`superseded`) is gone. A row of a later pass whose same line Aksh had dropped
 * himself in an earlier pass stays dropped: his decision is not undone by the machine reading the page again, so the later row is not
 * listed and the earlier one remains, unticked, for him to change his mind.
 */
export function currentRows<T>(rows: T[], of: (row: T) => PassRow): T[] {
  const dropped = rows.map(of).filter((r) => r.status === "rejected" && !r.superseded);
  return rows.filter((row) => {
    const r = of(row);
    if (r.superseded) return false;
    return !dropped.some((d) => d.key === r.key && d.pass < r.pass);
  });
}
