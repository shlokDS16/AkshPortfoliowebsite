import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { LocalStack } from "./stack";

// Test setup only: the secret key writes heartbeats the way the real jobs do, and the local
// Postgres is emptied through the CLI (service_role has no DELETE grant, by design).

const sinceMinutes = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function clearHeartbeats(): void {
  const sql = "delete from public.heartbeats";
  execFileSync("supabase", ["db", "query", "--local", process.platform === "win32" ? `"${sql}"` : sql], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
}

type Beat = { job: "heartbeat:pump" | "heartbeat:daily"; minutesAgo: number; ok?: boolean };

export async function seedHeartbeats(stack: LocalStack, beats: Beat[]): Promise<void> {
  const client = createClient(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const rows = beats.map((b) => ({ job: b.job, ran_at: sinceMinutes(b.minutesAgo), ok: b.ok ?? true, detail: "e2e seed" }));
  const { error } = await client.from("heartbeats").insert(rows);
  if (error) throw error;
}

/** Both clocks healthy: the pump 5 min ago, the daily job 3 h ago. */
export async function resetToFreshHeartbeats(stack: LocalStack): Promise<void> {
  clearHeartbeats();
  await seedHeartbeats(stack, [
    { job: "heartbeat:pump", minutesAgo: 5 },
    { job: "heartbeat:daily", minutesAgo: 180 },
  ]);
}
