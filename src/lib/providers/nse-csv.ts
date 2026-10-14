import type { Close } from "./market-data";

// Parsers for NSE's two daily files (ADR-005 s2, headers read 2026-10-13). Pure functions, shared by the fetched path and
// the hand-drop path. Strict about what they rely on: the header row must carry every column used, exactly once; every
// row must have the header's number of fields; a row that is used must have a real, positive number. Columns they do not
// use are ignored. Nothing is ever defaulted: a number that does not parse refuses the file, never becomes zero. Error
// messages carry a column name or a symbol, never a value from the file.

export type CsvErrorCode = "bad_header" | "empty" | "malformed" | "bad_date" | "bad_number" | "duplicate" | "missing_index" | "too_large";

export class CsvError extends Error {
  constructor(readonly code: CsvErrorCode, message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/** Series NSE reports as equity for a listed company, best first (spec s7). Every other series is ignored. */
export const SERIES_PREFERENCE = ["EQ", "BE", "BZ", "SM", "ST"] as const;

/**
 * Shape limits, checked inside the parsing loop so a hostile file stops the parser early (a small honest zip of tiny rows
 * would otherwise become gigabytes of arrays). The real equity file has about 3,700 rows of 34 fields; fields are under 100.
 */
export const MAX_ROWS = 50_000;
export const MAX_FIELDS_PER_ROW = 256;
export const MAX_FIELD_CHARS = 4_096;

const tooLarge = (what: string) => new CsvError("too_large", `the file has too many ${what}`);

/** RFC 4180 rows: quoted fields may hold commas, line breaks and doubled quotes; blank lines are skipped. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let atFieldStart = true;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const endRow = () => {
    row.push(field);
    if (row.length > MAX_FIELDS_PER_ROW) throw tooLarge("fields in a row");
    if (row.length > 1 || row[0] !== "") {
      if (rows.length >= MAX_ROWS) throw tooLarge("rows");
      rows.push(row);
    }
    row = [];
    field = "";
    atFieldStart = true;
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (field.length > MAX_FIELD_CHARS) throw tooLarge("characters in a field");
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        const next = source[i + 1];
        // After the closing quote only a separator may follow: `"10"5` is not 105.
        if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") throw new CsvError("malformed", "text after a closing quote");
      }
    } else if (ch === '"') {
      if (!atFieldStart) throw new CsvError("malformed", "a quote in the middle of a field");
      quoted = true;
      atFieldStart = false;
    } else if (ch === ",") {
      row.push(field);
      if (row.length > MAX_FIELDS_PER_ROW) throw tooLarge("fields in a row");
      field = "";
      atFieldStart = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (quoted) throw new CsvError("malformed", "a quoted field is never closed");
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Column positions by name; every required name must appear exactly once. */
function columns<T extends string>(header: readonly string[], required: readonly T[]): Record<T, number> {
  const names = header.map((h) => h.trim());
  const at = {} as Record<T, number>;
  for (const name of required) {
    const first = names.indexOf(name);
    if (first < 0 || names.indexOf(name, first + 1) >= 0) throw new CsvError("bad_header", `the header row has no single "${name}" column`);
    at[name] = first;
  }
  return at;
}

/** Splits into the header and the data rows, and refuses a ragged row (a cut or changed file). */
function table(text: string): { header: string[]; rows: string[][] } {
  const [header, ...rows] = parseCsvRows(text);
  if (!header) throw new CsvError("bad_header", "the file is empty");
  return { header, rows };
}

function checkWidths(header: readonly string[], rows: readonly string[][]): void {
  const bad = rows.findIndex((r) => r.length !== header.length);
  if (bad >= 0) throw new CsvError("malformed", `row ${bad + 2} has ${rows[bad].length} fields, the header has ${header.length}`);
}

function realDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{2})-(\d{2})-(\d{4})$/;
/** What the database column keeps: numeric(14, 4) is ten whole digits and four decimals (migration 0011). */
const PRICE = /^\d{1,10}(\.\d{1,4})?$/;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function isoDate(value: string, what: string): string {
  const m = ISO.exec(value.trim());
  if (!m || !realDate(Number(m[1]), Number(m[2]), Number(m[3]))) throw new CsvError("bad_date", `${what} is not a date`);
  return m[0];
}

/** An ISIN in its standard shape, or null for blank or any other shape (the database keeps only that shape too); a control character refuses the file. */
function isin(value: string, symbol: string): string | null {
  if (CONTROL.test(value)) throw new CsvError("malformed", `the ISIN for ${symbol} holds a control character`);
  const text = value.trim();
  return ISIN.test(text) ? text : null;
}

/** A positive decimal with no sign, no thousands comma and no exponent; anything else is refused, never read as zero. */
function price(value: string, what: string): number {
  const text = value.trim();
  const n = PRICE.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) throw new CsvError("bad_number", `${what} is blank or not a positive number`);
  return n;
}

const BHAV_COLUMNS = ["TradDt", "Sgmt", "Src", "ISIN", "TckrSymb", "SctySrs", "ClsPric"] as const;

/**
 * The equity day. Rows for the asked symbols only (matched case-blind), the best series per symbol; a symbol the file
 * does not carry in an equity series is simply absent. The date is the file's own and every row must agree with it.
 */
export function parseBhavcopyCsv(csv: string, symbols: readonly string[]): { tradeDate: string; closes: Close[] } {
  const { header, rows } = table(csv);
  const at = columns(header, BHAV_COLUMNS);
  checkWidths(header, rows);
  if (rows.length === 0) throw new CsvError("empty", "the file has a header and no rows");

  const tradeDate = isoDate(rows[0][at.TradDt], "TradDt");
  const wanted = new Set(symbols.map((s) => s.trim().toUpperCase()));
  const found = new Map<string, Map<string, { row: number; isin: string; close: string }>>();
  for (const [i, r] of rows.entries()) {
    if (isoDate(r[at.TradDt], "TradDt") !== tradeDate) throw new CsvError("bad_date", "the file holds more than one trade date");
    if (r[at.Sgmt].trim() !== "CM" || r[at.Src].trim() !== "NSE") continue;
    const symbol = r[at.TckrSymb].trim().toUpperCase();
    const series = r[at.SctySrs].trim().toUpperCase();
    if (!wanted.has(symbol) || !(SERIES_PREFERENCE as readonly string[]).includes(series)) continue;
    const bySeries = found.get(symbol) ?? new Map();
    if (bySeries.has(series)) throw new CsvError("duplicate", `${symbol} appears twice in series ${series}`);
    bySeries.set(series, { row: i + 2, isin: r[at.ISIN], close: r[at.ClsPric] });
    found.set(symbol, bySeries);
  }

  const closes: Close[] = [];
  for (const symbol of wanted) {
    const bySeries = found.get(symbol);
    const series = SERIES_PREFERENCE.find((s) => bySeries?.has(s));
    if (!bySeries || !series) continue;
    const pick = bySeries.get(series)!;
    // Only the row that would be used is read; a blank here refuses the file rather than falling to a worse series.
    closes.push({ symbol, series, isin: isin(pick.isin, symbol), close: price(pick.close, `ClsPric for ${symbol} (row ${pick.row})`) });
  }
  return { tradeDate, closes };
}

const INDEX_COLUMNS = ["Index Name", "Index Date", "Closing Index Value"] as const;
const NIFTY_50 = "Nifty 50";

/** The "Nifty 50" row (the price index, ADR-005 s2): exactly one, by exact name. */
export function parseIndexCsv(csv: string): { tradeDate: string; close: number } {
  const { header, rows } = table(csv);
  const at = columns(header, INDEX_COLUMNS);
  checkWidths(header, rows);
  const mine = rows.filter((r) => r[at["Index Name"]].trim() === NIFTY_50);
  if (mine.length === 0) throw new CsvError("missing_index", "there is no Nifty 50 row");
  if (mine.length > 1) throw new CsvError("duplicate", "the Nifty 50 appears more than once");
  const dmy = DMY.exec(mine[0][at["Index Date"]].trim());
  if (!dmy) throw new CsvError("bad_date", "Index Date is not a date");
  const tradeDate = isoDate(`${dmy[3]}-${dmy[2]}-${dmy[1]}`, "Index Date");
  return { tradeDate, close: price(mine[0][at["Closing Index Value"]], "Closing Index Value") };
}
