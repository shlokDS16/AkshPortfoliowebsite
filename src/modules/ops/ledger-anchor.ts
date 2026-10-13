import type { AnchorMiss, AnchorPort, AnchorRead, AnchorWrite } from "@/lib/providers";
import { jobDbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { anchorFileName, compareYear, type AnchorRow } from "./ledger-anchor-compare";

// ledger:anchor, the third ledger step of the daily job (spec s8, s9, s26, ADR-005 s3.3 and s6). Job code: it joins the
// ledger's sealed days to AnchorPort, which the ledger module cannot name.
//
// Order: SEAL (database) -> READ the public file(s) -> COMPARE with every sealed line -> APPEND only the missing tail -> RECORD
// publication for exactly the lines the comparison or the write confirmed. A crash between any two steps leaves a state the next
// run repairs by itself (see the Task 9 report). Records nothing unless the write answered `ok`, or the lines were already
// seen in the file by the comparison. The private ledger is consistent with itself; a published copy lets a reader who kept
// a copy detect a later change. Nothing here says more than that.
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

export type AnchorJobDeps = {
  db: Db;
  /** Builds the port. Called inside the step: the factory throws on a configuration error, and that must become a failed heartbeat. */
  anchor: () => AnchorPort;
  /** Milliseconds, monotonic enough for a budget. */
  clock: () => number;
  /** The wall clock, for the time publication is recorded at. */
  now: () => Date;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MESSAGE_LIMIT = 160;

/** The port never throws by contract; a bug in an adapter must still be an outcome, not a lost run. */
const askRead = (port: AnchorPort, file: string, timeoutMs: number): Promise<AnchorRead> =>
  Promise.resolve().then(() => port.read(file, { timeoutMs })).catch(() => ({ kind: "provider_error" as const, message: "the public file could not be read" }));
/** A write that threw may have been sent: it is `unconfirmed`, which records nothing and is settled by the next read. */
const askWrite = (port: AnchorPort, file: string, text: string, expected: string | null, timeoutMs: number): Promise<AnchorWrite> =>
  Promise.resolve().then(() => port.write(file, text, { expected, timeoutMs })).catch(() => ({ kind: "unconfirmed" as const, message: "the update failed unexpectedly" }));

const NOTHING = "nothing was published";

/** The plain reason for every outcome that is not a success. `where` is only used to word the two that differ. */
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

async function boundDate(db: Db, ascending: boolean): Promise<string | null> {
  const { data, error } = await db.from("ledger_anchors").select("anchor_date").order("anchor_date", { ascending }).limit(1);
  if (error) throw jobDbError("ledger.readAnchors", error);
  return data?.[0]?.anchor_date ?? null;
}

async function yearRows(db: Db, year: number): Promise<AnchorRow[]> {
  const { data, error } = await db
    .from("ledger_anchors")
    .select("anchor_date, line, published_at")
    .gte("anchor_date", `${year}-01-01`)
    .lte("anchor_date", `${year}-12-31`)
    .order("anchor_date", { ascending: true });
  if (error) throw jobDbError("ledger.readAnchors", error);
  return (data ?? []).map((r) => ({ date: r.anchor_date, line: r.line, published: r.published_at !== null }));
}

async function countUnpublished(db: Db): Promise<number> {
  const { count, error } = await db.from("ledger_anchors").select("anchor_date", { count: "exact", head: true }).is("published_at", null);
  if (error) throw jobDbError("ledger.readAnchors", error);
  return count ?? 0;
}

/** The one permitted update of a row: publication, once. A row that is already marked is left alone. */
async function recordPublished(db: Db, dates: readonly string[], version: string | null, at: Date): Promise<void> {
  for (let i = 0; i < dates.length; i += ROWS_PER_UPDATE) {
    const { error } = await db
      .from("ledger_anchors")
      .update({ published_at: at.toISOString(), anchor_version: version })
      .in("anchor_date", dates.slice(i, i + ROWS_PER_UPDATE))
      .is("published_at", null);
    if (error) throw jobDbError("ledger.recordPublished", error);
  }
}

type YearPlan = { year: number; file: string; text: string | null; version: string | null; settled: AnchorRow[]; tail: AnchorRow[] };

/**
 * ledger:anchor. Seals every finished India day, and, only when the owner has switched the public copy on, appends the missing
 * lines to the year's public file after checking the whole file against the ledger. Safe to run twice (the cron may duplicate).
 */
export async function publishAnchors(deps: AnchorJobDeps, budgetMs = ANCHOR_BUDGET_MS): Promise<string> {
  const { db } = deps;
  const started = deps.clock();
  const timeLeft = () => budgetMs - (deps.clock() - started);

  const sealed = await seal(db, timeLeft);
  const sealedText = `sealed ${plural(sealed, "day")}`;

  let port: AnchorPort;
  try {
    port = deps.anchor();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new Error(`the public copy is not set up correctly: ${reason.slice(0, MESSAGE_LIMIT)}`);
  }

  const [firstDate, lastDate] = [await boundDate(db, true), await boundDate(db, false)];
  if (firstDate === null || lastDate === null) return `${sealedText}; no finished day to publish yet`;

  // READ and COMPARE every year the ledger holds, oldest first. Nothing is written or recorded until all of them agree.
  const plans: YearPlan[] = [];
  for (let year = Number(firstDate.slice(0, 4)); year <= Number(lastDate.slice(0, 4)); year += 1) {
    if (timeLeft() < MIN_CALL_MS) throw new Error(`ran out of time reading the public file; ${NOTHING}`);
    const file = anchorFileName(year);
    const read = await askRead(port, file, Math.min(READ_TIMEOUT_MS, timeLeft()));
    if (read.kind === "not_configured") {
      return `${sealedText}; the public copy is off, ${plural(await countUnpublished(db), "day")} waiting`;
    }
    let text: string | null;
    let version: string | null;
    if (read.kind === "ok") {
      text = read.text;
      version = read.version;
    } else if (read.kind === "absent" && read.what === "file") {
      text = null; // a year whose file does not exist yet; acceptable only if nothing of it was published (compareYear)
      version = null;
    } else {
      throw new Error(describeMiss(read));
    }
    const check = compareYear(file, text, await yearRows(db, year));
    if (check.kind === "refuse") throw new Error(`${check.reason}; ${NOTHING}`);
    plans.push({ year, file, text, version, settled: check.settled, tail: check.tail });
  }

  // APPEND the missing tail of the oldest year that has one: one write a run, never a retry, never a second year in the same run.
  const target = plans.find((p) => p.tail.length > 0);
  let writtenVersion: string | null = null;
  let wrote = false;
  let alreadyThere = false;
  if (target) {
    if (timeLeft() < MIN_CALL_MS) throw new Error(`ran out of time before updating the public file; ${NOTHING}`);
    // The new text is exactly what was read plus the new lines: the port refuses anything else.
    const next = (target.text ?? "") + target.tail.map((r) => `${r.line}\n`).join("");
    const result = await askWrite(port, target.file, next, target.text, timeLeft());
    if (result.kind === "ok") {
      wrote = true;
      writtenVersion = result.version;
    } else if (result.kind === "nothing_to_add") {
      alreadyThere = true; // sent nowhere; the next run's comparison marks the lines
    } else {
      throw new Error(describeMiss(result));
    }
  }

  // RECORD publication for exactly the lines confirmed: those the comparison saw in the file, and (only after `ok`) the tail.
  let recorded = 0;
  const at = deps.now();
  for (const plan of plans) {
    const confirmed = wrote && plan === target ? [...plan.settled, ...plan.tail] : plan.settled;
    if (confirmed.length === 0) continue;
    await recordPublished(db, confirmed.map((r) => r.date), wrote && plan === target ? writtenVersion : plan.version, at);
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
