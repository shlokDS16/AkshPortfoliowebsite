import { istDate } from "@/lib/dates";
import type { AnchorMiss, AnchorPort, AnchorReadAll, AnchorWrite } from "@/lib/providers";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { anchorFileName, compareYear, type AnchorRow } from "./ledger-anchor-compare";

// ledger:anchor, the third ledger step of the daily job (spec s8, s9, s26, s27, ADR-005 s3.3 and s6). Job code: it joins the
// ledger's sealed days to AnchorPort, which the ledger module cannot name.
//
// Order: SEAL (database) -> READ the whole gist once -> COMPARE with every sealed line, every year -> APPEND only the missing
// tail -> READ again and check our text is still there -> RECORD publication for exactly the lines the comparison or the write
// confirmed. A crash between any two steps leaves a state the next run repairs by itself (see the Task 9 reports). Records
// nothing unless the write answered `ok`, or the lines were already seen in the file by the comparison. The private ledger is
// consistent with itself; a published copy lets a reader who kept a copy detect a later change. Nothing here says more than that.
//
// When the public copy is on, the file is ALWAYS read and compared, even with no sealed line. When it is off, that is green only
// until the first line has been published; after that a missing setting is red (it must not silently stop the daily append).
//
// Every result and reason below is fixed text built from counts, dates and file names. It never holds a token, a gist id, a
// response, a line of the file or the database's own error text.

/** The ledger:anchor budget (spec s8). The three ledger steps together stay at 45 s. */
export const ANCHOR_BUDGET_MS = 15_000;
/** A call is not started with less than this left. */
const MIN_CALL_MS = 1000;
/** The port's own default for a read; the step passes less when less is left. */
const READ_TIMEOUT_MS = 7000;
/** A year holds at most 366 lines, so a year's rows fit one page of the data API (default cap 1,000). */
const ROWS_PER_UPDATE = 100;
/** The recording update's own limit: it is attempted even when the budget is spent, so a confirmed write is not left unmarked. */
const RECORD_DB_MS = 5000;
/** The year this ledger starts (spec s27). Never raised: the public file of every year since then is compared on every run. */
export const FIRST_ANCHOR_YEAR = 2026;
const LEDGER_FILE = /^ledger-(\d{4})\.jsonl$/;

export type AnchorJobDeps = {
  db: Db;
  /** Builds the port. Called inside the step: the factory throws on a configuration error, and that must become a failed heartbeat. */
  anchor: () => AnchorPort;
  /** Milliseconds, monotonic enough for a budget. */
  clock: () => number;
  /** The wall clock, for the time publication is recorded at and for the current India year. */
  now: () => Date;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MESSAGE_LIMIT = 160;

/** The port never throws by contract; a bug in an adapter must still be an outcome, not a lost run. */
const askReadAll = (port: AnchorPort, timeoutMs: number): Promise<AnchorReadAll> =>
  Promise.resolve().then(() => port.readAll({ timeoutMs })).catch(() => ({ kind: "provider_error" as const, message: "the public file could not be read" }));
/** A write that threw may have been sent: it is `unconfirmed`, which records nothing and is settled by the next read. */
const askWrite = (port: AnchorPort, file: string, text: string, expected: string | null, timeoutMs: number): Promise<AnchorWrite> =>
  Promise.resolve().then(() => port.write(file, text, { expected, timeoutMs })).catch(() => ({ kind: "unconfirmed" as const, message: "the update failed unexpectedly" }));

const NOTHING = "nothing was published";
const CHECK_AFTER_FAILED =
  "the public file was updated but could not be checked afterwards; nothing was recorded, and the next run will check the file and record it";
const CHANGED_AFTER =
  "the public file no longer matches what this run wrote and compared; nothing was recorded, and the next run will check it again";

/** The plain reason for every outcome that is not a success. */
function describeMiss(miss: AnchorMiss | Exclude<AnchorWrite, { kind: "ok" | "nothing_to_add" }>): string {
  switch (miss.kind) {
    case "not_configured": return `the public copy was switched off during the run; ${NOTHING}`;
    case "absent": return miss.what === "gist" ? `the gist was not found, check the gist id; ${NOTHING}` : `the public file was not found; ${NOTHING}`;
    case "unauthorized": return `GitHub refused the key; ${NOTHING}`;
    case "rate_limited": return `GitHub is limiting requests; the next daily run will try again; ${NOTHING}`;
    case "too_large": return `the public file is too large to be read whole; it will not clear by itself; ${NOTHING}`;
    case "provider_error": return `the public file could not be reached just now; ${NOTHING}`;
    case "invalid_request": return `the step asked for something the public-copy port refuses, which is a defect; ${NOTHING}`;
    case "cannot_write": return `the token cannot write to the gist; ${NOTHING}`;
    case "changed": return "the public file changed while it was being updated; nothing was written or recorded, and the next run will check it again";
    case "unconfirmed": return "the update to the public file was sent and its result is not known; nothing was recorded, and the next run will read the file first";
    case "interrupted": return "another change to the public file was seen while it was being updated; nothing was recorded, and the next run will check the file again";
  }
}

async function seal(db: Db, timeLeft: () => number): Promise<number> {
  const signal = AbortSignal.timeout(Math.max(1, timeLeft()));
  const { data, error } = await db.rpc("seal_ledger_days").abortSignal(signal);
  if (error) {
    if (signal.aborted) throw new Error("sealing did not finish within its time limit");
    const code = /^ledger:([a-z_]+)/.exec(error.message)?.[1];
    // The most serious signal the system has: say so, publish nothing, and let the later steps run.
    if (code === "chain_broken" || code === "anchor_mismatch") throw new Error(`the ledger failed its own check (${code}); nothing was sealed or published`);
    throw jobDbError("ledger.seal", error);
  }
  return Number(data ?? 0);
}

/** Every read of the ledger carries an abort signal of the time left: a stalled data API cannot hold the step (and the sweep behind it). */
type Reader = { signal: () => AbortSignal };

/** A failed read: the budget when its own signal fired, else the operation and code only. */
function readFailure(error: { message: string; code?: string }, signal: AbortSignal): Error {
  return signal.aborted ? new Error(`ran out of time reading the ledger; ${NOTHING}`) : jobDbError("ledger.readAnchors", error);
}

async function boundDate(db: Db, r: Reader, ascending: boolean): Promise<string | null> {
  const signal = r.signal();
  const { data, error } = await db.from("ledger_anchors").select("anchor_date").order("anchor_date", { ascending }).limit(1).abortSignal(signal);
  if (error) throw readFailure(error, signal);
  return data?.[0]?.anchor_date ?? null;
}

async function yearRows(db: Db, r: Reader, year: number): Promise<AnchorRow[]> {
  const signal = r.signal();
  const { data, error } = await db
    .from("ledger_anchors")
    .select("anchor_date, line, published_at, created_at")
    .gte("anchor_date", `${year}-01-01`)
    .lte("anchor_date", `${year}-12-31`)
    .order("anchor_date", { ascending: true })
    .abortSignal(signal);
  if (error) throw readFailure(error, signal);
  return (data ?? []).map((row) => ({ date: row.anchor_date, line: row.line, published: row.published_at !== null, createdAt: row.created_at }));
}

async function countRows(db: Db, r: Reader, publishedRows: boolean): Promise<number> {
  const signal = r.signal();
  const query = db.from("ledger_anchors").select("anchor_date", { count: "exact", head: true });
  const { count, error } = await (publishedRows ? query.not("published_at", "is", null) : query.is("published_at", null)).abortSignal(signal);
  if (error) throw readFailure(error, signal);
  return count ?? 0;
}

/** The time publication is recorded at: now, but never before the newest of these rows was created (the database's guard refuses that). */
function recordTime(now: Date, rows: readonly AnchorRow[]): Date {
  let at = now.getTime();
  for (const row of rows) {
    const created = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
    if (created > at) at = created;
  }
  return new Date(at);
}

/** The one permitted update of a row: publication, once. A row that is already marked is left alone. */
async function recordPublished(db: Db, dates: readonly string[], version: string | null, at: Date): Promise<void> {
  for (let i = 0; i < dates.length; i += ROWS_PER_UPDATE) {
    const signal = AbortSignal.timeout(RECORD_DB_MS);
    const { error } = await db
      .from("ledger_anchors")
      .update({ published_at: at.toISOString(), anchor_version: version })
      .in("anchor_date", dates.slice(i, i + ROWS_PER_UPDATE))
      .is("published_at", null)
      .abortSignal(signal);
    if (error) {
      if (signal.aborted) throw new Error("recording publication did not finish within its time limit; the next run will record it");
      throw jobDbError("ledger.recordPublished", error);
    }
  }
}

type YearPlan = { year: number; file: string; text: string | null; rows: number; settled: AnchorRow[]; tail: AnchorRow[] };

/**
 * ledger:anchor. Seals every finished India day, and, only when the owner has switched the public copy on, appends the missing
 * lines to the year's public file after checking the whole gist against the ledger. Safe to run twice (the cron may duplicate).
 */
export async function publishAnchors(deps: AnchorJobDeps, budgetMs = ANCHOR_BUDGET_MS): Promise<string> {
  const { db } = deps;
  const started = deps.clock();
  const timeLeft = () => budgetMs - (deps.clock() - started);
  const reader: Reader = { signal: () => AbortSignal.timeout(Math.max(1, timeLeft())) };

  const sealed = await seal(db, timeLeft);
  const sealedText = `sealed ${plural(sealed, "day")}`;

  let port: AnchorPort;
  try {
    port = deps.anchor();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new Error(`the public copy is not set up correctly: ${reason.slice(0, MESSAGE_LIMIT)}`);
  }

  // ONE read of the gist, whatever the number of years. The file is read and compared whenever the public copy is on, even when
  // the database holds no line at all: a gist that holds lines beside a database that does not is the largest disagreement.
  if (timeLeft() < MIN_CALL_MS) throw new Error(`ran out of time reading the public file; ${NOTHING}`);
  const gist = await askReadAll(port, Math.min(READ_TIMEOUT_MS, timeLeft()));
  if (gist.kind === "not_configured") {
    const waiting = await countRows(db, reader, false);
    // Off is fine until something was published. After that, a lost setting must not silently stop the comparison and the append.
    if ((await countRows(db, reader, true)) > 0) {
      throw new Error(`the public copy is switched off, but lines were published before; the public file was not checked (${plural(waiting, "day")} waiting)`);
    }
    return `${sealedText}; the public copy is off, ${plural(waiting, "day")} waiting`;
  }
  if (gist.kind !== "ok") throw new Error(describeMiss(gist));

  // The years to compare: the fixed first year (or the database's first, if older) to the current India year (or the database's
  // last), plus every year the gist has a ledger file for. A file the database has no line for is a refusal, not an omission.
  const [firstDate, lastDate] = [await boundDate(db, reader, true), await boundDate(db, reader, false)];
  const thisYear = Number(istDate(deps.now()).slice(0, 4));
  const low = Math.min(FIRST_ANCHOR_YEAR, firstDate ? Number(firstDate.slice(0, 4)) : FIRST_ANCHOR_YEAR);
  const high = Math.max(thisYear, lastDate ? Number(lastDate.slice(0, 4)) : low, low);
  const years = new Set<number>();
  for (let year = low; year <= high; year += 1) years.add(year);
  for (const name of gist.files.keys()) {
    const match = LEDGER_FILE.exec(name);
    if (match) years.add(Number(match[1]));
  }

  // COMPARE every year, oldest first. Nothing is written or recorded until all of them agree.
  const plans: YearPlan[] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    const file = anchorFileName(year);
    const text = gist.files.get(file) ?? null; // a year whose file does not exist yet is acceptable only if nothing of it was published (compareYear)
    const rows = await yearRows(db, reader, year);
    const check = compareYear(file, text, rows);
    if (check.kind === "refuse") throw new Error(`${check.reason}; ${NOTHING}`);
    plans.push({ year, file, text, rows: rows.length, settled: check.settled, tail: check.tail });
  }
  if (plans.every((p) => p.rows === 0)) return `${sealedText}; no finished day to publish yet`;

  // APPEND the missing tail of the oldest year that has one: one write a run, never a retry, never a second year in the same run.
  const target = plans.find((p) => p.tail.length > 0);
  let writtenVersion: string | null = null;
  let wrote = false;
  let alreadyThere = false;
  let next = "";
  if (target) {
    if (timeLeft() < MIN_CALL_MS) throw new Error(`ran out of time before updating the public file; ${NOTHING}`);
    // The new text is exactly what was read plus the new lines: the port refuses anything else.
    next = (target.text ?? "") + target.tail.map((r) => `${r.line}\n`).join("");
    const result = await askWrite(port, target.file, next, target.text, timeLeft());
    if (result.kind === "ok") {
      wrote = true;
      writtenVersion = result.version;
    } else if (result.kind === "nothing_to_add") {
      alreadyThere = true; // sent nowhere; the next run's comparison marks the lines
    } else if (result.kind === "changed" && result.found === next) {
      // A twin run (a duplicated cron call) wrote exactly this text a moment ago. Harmless; its lines are recorded by whoever
      // finishes, or by the next run's comparison. This run records nothing.
      return `${sealedText}; the public copy was already updated by another run; it will be recorded on the next run`;
    } else {
      throw new Error(describeMiss(result));
    }
  }

  const confirmedOf = (plan: YearPlan): AnchorRow[] => (wrote && plan === target ? [...plan.settled, ...plan.tail] : plan.settled);

  // GUARD (review M-1): after a write, read the gist again and record only if every file we are about to mark still begins with what
  // this run compared and wrote. This narrows, and cannot close, the window in which another run's older text lands after ours
  // (closing it needs a single-flight lease in the database: an open question).
  if (wrote) {
    if (timeLeft() < MIN_CALL_MS) throw new Error(CHECK_AFTER_FAILED);
    const again = await askReadAll(port, Math.min(READ_TIMEOUT_MS, timeLeft()));
    if (again.kind !== "ok") throw new Error(CHECK_AFTER_FAILED);
    for (const plan of plans) {
      if (confirmedOf(plan).length === 0) continue;
      const kept = plan === target ? next : (plan.text ?? "");
      if (!(again.files.get(plan.file) ?? "").startsWith(kept)) throw new Error(CHANGED_AFTER);
    }
  }

  // RECORD publication for exactly the lines confirmed: those the comparison saw in the file, and (only after `ok`) the tail.
  let recorded = 0;
  for (const plan of plans) {
    const confirmed = confirmedOf(plan);
    if (confirmed.length === 0) continue;
    await recordPublished(db, confirmed.map((r) => r.date), wrote && plan === target ? writtenVersion : gist.version, recordTime(deps.now(), confirmed));
    recorded += confirmed.length;
  }

  const parts = [sealedText];
  if (wrote && target) {
    const first = (target.tail[0] as AnchorRow).date;
    const last = (target.tail[target.tail.length - 1] as AnchorRow).date;
    parts.push(`added ${plural(target.tail.length, "day")} to the public copy (${first === last ? first : `${first} to ${last}`})`);
  }
  const settled = plans.reduce((n, p) => n + p.settled.length, 0);
  if (settled > 0) parts.push(`recorded ${plural(settled, "day")} already in the public copy`);
  if (alreadyThere) parts.push("the public copy was already up to date");
  const waiting = plans.filter((p) => p !== target).reduce((n, p) => n + p.tail.length, 0);
  if (waiting > 0) parts.push(`${plural(waiting, "day")} waiting for the next run`);
  if (!wrote && !alreadyThere && settled === 0 && waiting === 0 && recorded === 0) parts.push("the public copy is up to date");
  return parts.join("; ");
}
