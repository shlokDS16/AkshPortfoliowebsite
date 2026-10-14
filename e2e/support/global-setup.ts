import { createClient } from "@supabase/supabase-js";
import { clearFixtureAnchorDirectory, fixtureAnchorDirectory } from "../../src/lib/providers/fixture-anchor";
import { resetToFreshHeartbeats } from "./heartbeats";
import { readLocalStack, type LocalStack } from "./stack";

/**
 * The fixture gist is a double that outlives the app server (it is kept in a directory named from the local database's address),
 * as a real gist outlives the app. Its lines and the database's "published" marks must agree, and they only disagree when the
 * DATABASE was reset (`pnpm db:reset` empties the ledger; the gist is elsewhere). So: an empty ledger means a new world, and
 * the gist starts empty too. A ledger that already holds lines keeps its gist, which is what lets the e2e be run again without
 * a reset.
 */
async function startFixtureGistInStepWithLedger(stack: LocalStack): Promise<void> {
  const client = createClient(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { count, error } = await client.from("ledger_anchors").select("anchor_date", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) === 0) clearFixtureAnchorDirectory(fixtureAnchorDirectory(stack.apiUrl));
}

/**
 * With the local stack up, start every run with healthy clocks so the desk's red strip does not
 * appear in unrelated desk specs. desk-clocks.spec.ts sets its own states and restores this one.
 */
export default async function globalSetup(): Promise<void> {
  const stack = readLocalStack();
  if (stack) {
    await resetToFreshHeartbeats(stack);
    await startFixtureGistInStepWithLedger(stack);
  }
}
