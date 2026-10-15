import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@/lib/supabase/types";
import { requireStack } from "./auth";

// Test setup for e2e/cases.spec.ts (Plan 3b Task 5; D43). LOCAL STACK ONLY: every function starts with requireStack(), which refuses
// to run when the stack is absent or its API URL is not local, and the SQL goes through `supabase db query --local`, which cannot
// reach the hosted project. The fixture rewrites the dates of the events it makes and re-seals the whole local chain and the sealed
// days (support/aged-case.sql); a `supabase db reset` before the next run puts the ledger back as it was.

const FIXTURE = join(process.cwd(), "e2e", "support", "aged-case.sql");

/** Runs owner SQL on the local database through the project's pinned CLI. */
function ownerSql(sql: string): void {
  requireStack();
  const dir = mkdtempSync(join(tmpdir(), "aksh-cases-"));
  const file = join(dir, "fixture.sql");
  try {
    writeFileSync(file, sql, "utf8");
    execFileSync("pnpm", ["exec", "supabase", "db", "query", "--local", "-f", process.platform === "win32" ? `"${file}"` : file], {
      stdio: ["ignore", "ignore", "pipe"],
      shell: process.platform === "win32",
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`The local fixture SQL failed: ${stderr || String(error)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The raw file, placeholders and all, as someone pasting it somewhere would run it. Returns what the refusal said, or null if it ran. */
export function runRawFixture(): string | null {
  try {
    ownerSql(readFileSync(FIXTURE, "utf8"));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export type AgedCase = { tag: string; symbol: string; company: string; ideaId: string };

function fixtureSql(tag: string, mode: "case" | "review"): string {
  return readFileSync(FIXTURE, "utf8").replaceAll("__TAG__", tag).replaceAll("__MODE__", mode);
}

/**
 * An invented company and one closed idea on it, written through the real ledger functions and then moved back in time (140 days to
 * 50 days ago), scored final with fetched-source closes. The owner switches are not touched.
 */
export async function seedAgedCase(db: Db): Promise<AgedCase> {
  requireStack();
  const tag = Date.now().toString(36);
  ownerSql(fixtureSql(tag, "case"));
  const symbol = `ZTR${tag.toUpperCase()}`;
  const company = await db.from("companies").select("id, name").eq("nse_symbol", symbol).single();
  if (company.error) throw company.error;
  const idea = await db.from("ideas").select("id").eq("company_id", company.data.id).single();
  if (idea.error) throw idea.error;
  return { tag, symbol, company: company.data.name, ideaId: idea.data.id };
}

/** A second lesson on the aged idea, dated 35 days back: the ledger's figures-to date moves under a case study already public. */
export function addAgedReview(aged: AgedCase): void {
  ownerSql(fixtureSql(aged.tag, "review"));
}

export type Switch = "ledger_reveal" | "ledger_chart";

/** The owner's act (runbook): a settings row with the value `on` turns a switch on; deleting the row turns it off. */
export function setSwitch(key: Switch, on: boolean): void {
  ownerSql(
    on
      ? `insert into private.settings (key, value) values ('${key}', 'on') on conflict (key) do update set value = excluded.value;`
      : `delete from private.settings where key = '${key}';`,
  );
}

export function switchesOff(): void {
  ownerSql("delete from private.settings where key in ('ledger_reveal', 'ledger_chart');");
}
