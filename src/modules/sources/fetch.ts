import type { SafeFetchDeps } from "@/modules/documents";
import { READ_TIMEOUT_MS, readPage, readThumbnail, readYoutube, type ReadFailure } from "./outbound";
import { MAX_READ_ATTEMPTS, type ProblemCode, type SourceKind } from "./types";

// The logic of the two source steps and of "Read again" (spec s6.4, D106), with the store, the link-fetch dependencies and the clock
// injected. The job code in src/modules/ops/source-steps.ts builds the store on the secret-key client and the dependencies from the env;
// this module holds neither. Every outcome is a heartbeat detail: counts and fixed words only, never a title, a link or a database message.

export const PUMP_BATCH = 5;
export const PUMP_BUDGET_MS = 40_000;
export const RECHECK_BATCH = 40;
export const RECHECK_BUDGET_MS = 35_000;
/** The longest one read can take: the title (10 s) and then the picture (10 s). A read is started only if it can finish inside the budget. */
export const READ_WORST_MS = 2 * READ_TIMEOUT_MS;
/** "Read again" waits this long after the last read or try of the same link (D106). */
export const COOLDOWN_MS = 60_000;

/** Problems that may pass: the pump tries these again (3 tries). Every other answer is final until he presses Read again. */
const TRANSIENT: ReadonlySet<ProblemCode> = new Set<ProblemCode>(["timeout", "unavailable"]);

export type SourceRef = {
  id: string;
  kind: SourceKind;
  youtubeId: string | null;
  url: string;
  fetchedAt: string | null;
  checkedAt: string | null;
  fetchAttempts: number;
  fetchProblem: ProblemCode | null;
  gone: boolean;
};

/**
 * The arguments of public.record_source_fetch, in the camel case of this module. There is no date in it on purpose: the database sets
 * `fetched_at` and `checked_at` itself, and only for a successful read, so a failed try can never restart the 30-day purge clock.
 */
export type RecordFetch = {
  linkId: string;
  found: boolean;
  gone: boolean;
  title: string | null;
  siteName: string | null;
  channelUrl: string | null;
  thumbPath: string | null;
  thumbSha256: string | null;
  problem: ProblemCode | null;
};

export interface FetchStore {
  /** Links never read, oldest first, at most `limit` (the rule of `isPending` is applied again on the result). */
  pending(limit: number): Promise<SourceRef[]>;
  /** YouTube links read before, not gone, not checked in the last 25 days, fewest failed tries first (a link that keeps failing goes to the back), then longest unchecked first, at most `limit`. */
  stale(limit: number): Promise<SourceRef[]>;
  byId(id: string): Promise<SourceRef | null>;
  /** Writes one result; returns the path of a picture the write left unused, for the caller to delete. */
  record(args: RecordFetch): Promise<string | null>;
  putThumb(path: string, bytes: Uint8Array): Promise<void>;
  removeThumbs(paths: readonly string[]): Promise<void>;
  /** Clears the YouTube data not checked in 30 days (migration 0026); returns the pictures no link uses any more. */
  purgeStale(): Promise<string[]>;
}

export type FetchDeps = { store: FetchStore; link: SafeFetchDeps; clock: () => number };

/** A link the pump may read: never read, not gone, fewer than 3 tries, and no final answer on record. */
export function isPending(ref: SourceRef): boolean {
  return !ref.gone && ref.fetchedAt === null && ref.fetchAttempts < MAX_READ_ATTEMPTS && (ref.fetchProblem === null || TRANSIENT.has(ref.fetchProblem));
}

const failed = (linkId: string, problem: ReadFailure): RecordFetch => ({
  linkId, found: false, gone: false, title: null, siteName: null, channelUrl: null, thumbPath: null, thumbSha256: null, problem,
});
const goneRecord = (linkId: string): RecordFetch => ({ ...failed(linkId, "not_found"), gone: true });

type Result = { kind: "read" | "problem" | "gone"; replaced: string | null };

/** Reads one link and writes the result. Throws only when the store fails (a database or storage error). */
async function readOne(deps: FetchDeps, ref: SourceRef): Promise<Result> {
  const { store, link } = deps;
  const write = async (args: RecordFetch, kind: Result["kind"]): Promise<Result> => ({ kind, replaced: await store.record(args) });
  if (ref.kind === "web") {
    const page = await readPage(ref.url, link);
    if (page.result !== "ok") return write(failed(ref.id, page.result), "problem");
    return write({ linkId: ref.id, found: true, gone: false, title: page.title, siteName: page.siteName, channelUrl: null, thumbPath: null, thumbSha256: null, problem: null }, "read");
  }
  const id = ref.youtubeId ?? "";
  const video = await readYoutube(id, link);
  // Missing at a re-check (it was read once) is "no longer on YouTube"; missing at the first read is only a problem on the card.
  if (video.result === "not_found" && ref.fetchedAt !== null) return write(goneRecord(ref.id), "gone");
  if (video.result !== "ok") return write(failed(ref.id, video.result), "problem");
  const base = { linkId: ref.id, found: true, gone: false, title: video.title, siteName: video.channelName, channelUrl: video.channelUrl };
  const picture = await readThumbnail(id, link);
  if (picture.result === "ok") {
    const path = `yt/${picture.sha256}.jpg`;
    await store.putThumb(path, picture.bytes);
    return write({ ...base, thumbPath: path, thumbSha256: picture.sha256, problem: null }, "read");
  }
  // A picture over the limit is final (the title is kept); any other failure is a failed try of the whole read, so it is tried again.
  if (picture.result === "too_big_image") return write({ ...base, thumbPath: null, thumbSha256: null, problem: "too_big_image" }, "read");
  return write(failed(ref.id, picture.result), "problem");
}

type Tally = { read: number; problems: number; gone: number; errors: number; cleanup: number; early: boolean };

/** Reads `refs` in order until the batch or the time budget is spent; a store failure on one link is counted and the next is read. */
async function readAll(deps: FetchDeps, refs: readonly SourceRef[], budgetMs: number): Promise<Tally> {
  const t: Tally = { read: 0, problems: 0, gone: 0, errors: 0, cleanup: 0, early: false };
  const started = deps.clock();
  for (const ref of refs) {
    if (deps.clock() - started + READ_WORST_MS > budgetMs) {
      t.early = true;
      break;
    }
    try {
      const result = await readOne(deps, ref);
      if (result.kind === "problem") t.problems += 1;
      else t.read += 1;
      if (result.kind === "gone") t.gone += 1;
      if (result.replaced) await deps.store.removeThumbs([result.replaced]).catch(() => (t.cleanup += 1));
    } catch {
      t.errors += 1;
    }
  }
  return t;
}

const join = (parts: Array<string | null>): string => parts.filter((p) => p !== null).join(", ");

function report(t: Tally, prefix: string | null, label: "read" | "checked", showProblems: boolean): string {
  if (t.errors > 0) throw new Error(`${label} ${t.read}, ${t.errors} could not be stored`);
  return join([
    prefix,
    `${label} ${t.read}`,
    showProblems && t.problems > 0 ? `problem ${t.problems}` : null,
    t.gone > 0 ? `gone ${t.gone}` : null,
    t.cleanup > 0 ? `pictures not deleted ${t.cleanup}` : null,
    t.early ? "stopped early: out of time" : null,
  ]);
}

/** `sources:fetch` (the pump): links never read, at most 5 a run, no read started that could run past 40 s. */
export async function fetchPendingSources(deps: FetchDeps): Promise<string> {
  const refs = (await deps.store.pending(PUMP_BATCH)).filter(isPending).slice(0, PUMP_BATCH);
  if (refs.length === 0) return "nothing to read";
  return report(await readAll(deps, refs, PUMP_BUDGET_MS), null, "read", true);
}

/**
 * `sources:recheck` (daily): first the 30-day purge (YouTube details not checked in 30 days are cleared and their pictures deleted, whatever
 * else happens), then the YouTube links not checked in 25 days, at most 40, no read started that could run past 35 s. Pages are never read again by the machine.
 */
export async function recheckSources(deps: FetchDeps): Promise<string> {
  const cleared = await deps.store.purgeStale();
  if (cleared.length > 0) await deps.store.removeThumbs(cleared);
  const prefix = cleared.length > 0 ? `purged ${cleared.length}` : null;
  const refs = await deps.store.stale(RECHECK_BATCH);
  if (refs.length === 0) return join([prefix, "nothing to check"]);
  return report(await readAll(deps, refs.slice(0, RECHECK_BATCH), RECHECK_BUDGET_MS), prefix, "checked", false);
}

export type ReadNowAnswer = "read" | "problem" | "gone" | "recent" | "no such source";

/**
 * "Read again" and the read right after a save: that one link, even if it was read before. A link read (successfully) in the last minute, or
 * tried in the last minute by this process, is not read again. `attempts` is this process's own record of its tries (a failed try writes no
 * date to the database, by design), the database's `checked_at` covers a read made by another instance. `fetched_at` is never the clock for this: it is set once, at the first read.
 */
export async function readSourceNow(deps: FetchDeps, id: string, attempts: Map<string, number>): Promise<ReadNowAnswer> {
  const ref = await deps.store.byId(id);
  if (!ref) return "no such source";
  const now = deps.clock();
  const last = Math.max(ref.checkedAt ? Date.parse(ref.checkedAt) : 0, attempts.get(id) ?? 0);
  if (last > 0 && now - last < COOLDOWN_MS) return "recent";
  attempts.set(id, now);
  const result = await readOne(deps, ref);
  if (result.replaced) await deps.store.removeThumbs([result.replaced]).catch(() => undefined);
  return result.kind;
}
