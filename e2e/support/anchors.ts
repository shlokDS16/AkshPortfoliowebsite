import { execFileSync } from "node:child_process";

// Test setup only (local stack). The e2e database has no event older than today, so two empty finished days placed just
// before the first event are exactly what the sealing function itself would have written for them: it keeps agreeing with
// the events, and the daily run has something to publish. Written through the CLI as the database owner (service_role has no
// INSERT on ledger_anchors, by design). Safe to repeat.
const SQL = [
  "insert into public.ledger_anchors (anchor_date, event_count, first_seq, last_seq, head_hash, line)",
  "select x.e - 3 + s, 0, null, null, repeat('0', 64), private.anchor_line_v1(x.e - 3 + s, 0, null::bigint, null::bigint, null::text[], repeat('0', 64))",
  "from (select coalesce(min((recorded_at at time zone 'Asia/Kolkata')::date), (now() at time zone 'Asia/Kolkata')::date) as e from public.idea_events) x,",
  "generate_series(1, 2) s on conflict do nothing",
].join(" ");

export function seedEmptyFinishedDays(): void {
  execFileSync("pnpm", ["exec", "supabase", "db", "query", "--local", process.platform === "win32" ? `"${SQL}"` : SQL], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
}
