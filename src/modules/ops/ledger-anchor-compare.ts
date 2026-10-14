// The comparison of one year's public file with ALL the sealed lines the database holds for that year (spec s9, ADR-005 s3.3,
// s26). Pure: no database, no port. The published text must equal the database's lines position by position; the database may
// hold more lines at the end (not yet published), never fewer and never different. Any difference is a refusal that names the
// first position and the ledger's own date, and never quotes the file (it is text anyone with the account could have typed).

/** One sealed day, in date order within its year. `published` is what the database has recorded, not what the file shows. */
export type AnchorRow = { date: string; line: string; published: boolean; /** When the database created the row (ISO). Carried through; the comparison does not look at it. */ createdAt?: string };

export type YearCheck =
  /** `settled`: rows the file already holds that the database has not marked. `tail`: rows still to be appended, oldest first. */
  | { kind: "ok"; fileLines: number; settled: AnchorRow[]; tail: AnchorRow[] }
  | { kind: "refuse"; reason: string };

/** One file per India calendar year, so the gist's 1 MB file limit is out of reach in normal use. */
export const anchorFileName = (year: number): string => `ledger-${year}.jsonl`;

const refuse = (reason: string): YearCheck => ({ kind: "refuse", reason });

/**
 * @param text the file exactly as the port returned it, or null when the file does not exist yet.
 * @param rows the database's lines for this year, oldest first.
 */
export function compareYear(file: string, text: string | null, rows: readonly AnchorRow[]): YearCheck {
  // A sealed line must be one non-empty line, or the file could not be split back into the lines that were written.
  const odd = rows.find((r) => r.line === "" || /[\r\n]/.test(r.line));
  if (odd) return refuse(`the sealed line for ${odd.date} is not a single line`);

  if (text === null || text === "") {
    const firstPublished = rows.findIndex((r) => r.published);
    if (firstPublished >= 0) {
      const what = text === null ? "is missing" : "is empty";
      return refuse(`the public file ${file} ${what}: it is missing line ${firstPublished + 1} (${(rows[firstPublished] as AnchorRow).date}), which was published`);
    }
    return { kind: "ok", fileLines: 0, settled: [], tail: [...rows] };
  }

  // The new lines are appended to this text, so a last line without its break would be continued instead of followed.
  if (!text.endsWith("\n")) {
    return refuse(`the public file ${file} does not end with a line break after line ${text.split("\n").length}`);
  }
  const lines = text.slice(0, -1).split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const mine = rows[i];
    if (mine === undefined) return refuse(`the public file ${file} has a line ${i + 1} that the ledger does not have`);
    if (lines[i] !== mine.line) return refuse(`the public file ${file} differs from the ledger at line ${i + 1} (${mine.date})`);
  }
  const lost = rows.findIndex((r, i) => i >= lines.length && r.published);
  if (lost >= 0) return refuse(`the public file ${file} is missing line ${lost + 1} (${(rows[lost] as AnchorRow).date}), which was published`);
  return {
    kind: "ok",
    fileLines: lines.length,
    settled: rows.slice(0, lines.length).filter((r) => !r.published),
    tail: rows.slice(lines.length),
  };
}
