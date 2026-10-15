import { createHash } from "node:crypto";

// A ledger record (version 1, spec s33.2) whose fingerprints are real: each hash is sha256(prev_hash + "\n" + canonical) in
// UTF-8, exactly as the seal trigger computes it (migration 0010). The sealed text here is JSON.stringify output; the database
// writes Postgres' own json text, which differs in spacing only, and the check is byte for byte on whatever string is stored.

export const FIXTURE_IDEA = "8a1f0f64-0000-4a00-8000-000000000001";
export const FIXTURE_COMPANY = "8a1f0f64-0000-4a00-8000-0000000000c1";
export const FIXTURE_PREV = createHash("sha256").update("an earlier entry in the chain", "utf8").digest("hex");

type Kind = "open" | "revise" | "close" | "review";
export type FixtureEvent = {
  seq: number;
  kind: Kind;
  at: string;
  words: string;
  stance: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  canonical: string;
  listed_on: string | null;
};

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

export function sealFixtureEvent(
  prev: string,
  seq: number,
  kind: Kind,
  at: string,
  words: string,
  stance: Record<string, unknown>,
  listedOn: string | null = null,
): FixtureEvent {
  const canonical = JSON.stringify({
    v: 1, seq, id: `8a1f0f64-0000-4a00-8000-00000000e${String(seq).padStart(3, "0")}`, idea: FIXTURE_IDEA, kind, at,
    company_id: FIXTURE_COMPANY, symbol: "KAVERI", isin: "INE000000001", company: "Kaveri Seed Company Limited", stance, words, nonce: `n-${seq}`,
  });
  return { seq, kind, at, words, stance, prev_hash: prev, hash: sha256Hex(`${prev}\n${canonical}`), canonical, listed_on: listedOn };
}

function chain(): FixtureEvent[] {
  const open = sealFixtureEvent(FIXTURE_PREV, 41, "open", "2026-01-12T05:30:00.123456Z", "Seed demand looks steady and the balance sheet is clean.", {
    expects: "outperform", benchmark: "NIFTY 50", horizon_days: 365,
  });
  const revise = sealFixtureEvent(open.hash, 44, "revise", "2026-03-02T06:10:00.000001Z", "I now think this needs two seasons, not one.", { horizon_days: 730 });
  const close = sealFixtureEvent(revise.hash, 52, "close", "2026-06-15T09:45:00.500000Z", "Closing: the margin story did not hold.", { reason: "thesis_broken" });
  const review = sealFixtureEvent(close.hash, 53, "review", "2026-06-16T04:00:00.000000Z", "I waited too long on the monsoon signal.", {
    process: "flawed", tags: ["timing", "valuation"],
  });
  return [open, revise, close, review];
}

export type FixtureRecord = {
  v: 1;
  idea: string;
  company_id: string;
  symbol: string;
  company: string;
  expects: string;
  benchmark: string;
  horizon_days: number;
  close_reason: string;
  process: string;
  tags: string[];
  entry_date: string;
  exit_date: string;
  holding_days: number;
  events: FixtureEvent[];
  chart: { points: { d: string; share: number; index: number }[] } | null;
  figures_to: string;
};

/** The record as the builder returns it (keys in the builder's order; the database stores jsonb, which does not keep that order). */
export function caseRecordFixture(patch: Partial<FixtureRecord> = {}): FixtureRecord {
  return {
    v: 1, idea: FIXTURE_IDEA, company_id: FIXTURE_COMPANY, symbol: "KAVERI", company: "Kaveri Seed Company Limited",
    expects: "outperform", benchmark: "NIFTY 50", horizon_days: 365, close_reason: "thesis_broken", process: "flawed", tags: ["timing", "valuation"],
    entry_date: "2026-01-13", exit_date: "2026-06-16", holding_days: 154, events: chain(), chart: null, figures_to: "2026-06-16", ...patch,
  };
}

export const FIXTURE_CHART = {
  points: [
    { d: "2026-01-13", share: 100, index: 100 },
    { d: "2026-03-02", share: 96.5, index: 101.25 },
    { d: "2026-06-16", share: 90.1, index: 104.7 },
  ],
};
