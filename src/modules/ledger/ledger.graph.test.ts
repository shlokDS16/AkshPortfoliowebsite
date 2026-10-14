import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Plan 3a Global Constraints: no LLM anywhere in the ledger, and the module never holds the secret-key client
// (only src/modules/ops may; ESLint NO_SECRET_CLIENT is the first fence, this is the second).
const SRC = resolve(__dirname, "../..");
const MODULE = __dirname;

const asFile = (base: string) => (existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(`${base}.tsx`) ? `${base}.tsx` : join(base, "index.ts"));

function moduleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return moduleFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every file reachable from `entries` through runtime imports, relative or "@/" (type-only imports are erased). */
function reachable(entries: string[], opaque: string[] = []): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file) || !existsSync(file)) continue;
    const source = strip(readFileSync(file, "utf8"));
    files.set(file, source);
    for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)) {
      const spec = match[1] as string;
      if (spec.startsWith("./") || spec.startsWith("../")) queue.push(asFile(resolve(dirname(file), spec)));
      else if (spec.startsWith("@/") && !opaque.some((o) => spec === o || spec.startsWith(`${o}/`))) queue.push(asFile(resolve(SRC, spec.slice(2))));
    }
  }
  return files;
}

const files = moduleFiles(MODULE);
const sources = files.map((f) => [f, strip(readFileSync(f, "utf8"))] as const);
const rel = (f: string) => f.slice(MODULE.length + 1).replaceAll("\\", "/");

describe("the ledger module's boundaries", () => {
  it("finds its own source files", () => {
    expect(files.map(rel)).toEqual(expect.arrayContaining(["index.ts", "client.ts", "repo.ts", "service.ts", "summary.ts", "journal.ts", "gate.ts"]));
  });

  it("no file names a provider port: no LLM, no OCR, no transcriber", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/@\/lib\/providers|\bLlmPort\b|\bOcrPort\b|\bTranscriberPort\b|\bMarketDataPort\b|\bAnchorPort\b/);
    }
  });

  it("no file imports the secret-key client or the server secrets", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/supabase\/service|env\.server|SUPABASE_SECRET_KEY|CRON_SECRET|process\.env/);
    }
  });

  it("nothing the module can reach at run time is the service client, the server env, or a provider", () => {
    // The two server actions (actions.ts) sign the owner in through `@/modules/identity`, whose own check reads the admin's
    // email from the server env. That is identity's business and is not followed; everything else the actions import is.
    const reached = reachable(files.filter((f) => !/fake-/.test(f) && !/test-fixtures/.test(f)), ["@/modules/identity"]);
    const paths = [...reached.keys()].map((p) => p.replaceAll("\\", "/"));
    expect(paths.some((p) => p.endsWith("lib/supabase/service.ts"))).toBe(false);
    expect(paths.some((p) => p.endsWith("lib/env.server.ts"))).toBe(false);
    expect(paths.some((p) => p.includes("lib/providers/"))).toBe(false);
  });

  it("only the actions file imports the identity module, and only to check the admin", () => {
    const importers = sources.filter(([, source]) => /@\/modules\/identity/.test(source)).map(([f]) => rel(f));
    expect(importers).toEqual(["actions.ts"]);
    const actions = sources.find(([f]) => rel(f) === "actions.ts")?.[1] ?? "";
    expect(actions).toMatch(/import \{ requireAdmin \} from "@\/modules\/identity";/);
  });

  it("the module writes nothing but through the two event doors, the item link, the rescore, the typed-close door and the corporate-action log", () => {
    // The one table the module may INSERT into is corporate_actions: the admin's own column-granted, append-only log (a correction
    // is a new row; no UPDATE or DELETE exists for any role). Prices, calendar, scores and anchors are never written from here.
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/\.from\("(idea_events|idea_scores|prices_daily|market_days|ledger_anchors|idea_score_changes)"\)\s*\.(insert|update|upsert|delete)/);
      expect(source, rel(file)).not.toMatch(/\.from\("corporate_actions"\)\s*\.(update|upsert|delete)/);
    }
    const inserts = sources.filter(([, source]) => /\.from\("corporate_actions"\)\s*\.insert/.test(source)).map(([f]) => rel(f));
    expect(inserts).toEqual(["repo.ts"]);
  });

  it("the only database functions the module calls are the ones on this list, each named by a literal", () => {
    // open_idea and add_idea_event are the two event doors; rescore_ideas recomputes scores in SQL; the two check functions
    // only read. Adding any other function (enter_closes, store_fetched_closes, a sealing function) is a decision, not a drive-by.
    // ledger_gate_facts (migration 0014) only reads: it is the publish gate's own view of one company, for the checklist.
    const ALLOWED_RPC = ["add_idea_event", "check_ledger_anchors", "check_ledger_chain", "enter_closes", "ledger_gate_facts", "open_idea", "rescore_ideas"];
    const used = new Set<string>();
    for (const [file, source] of sources) {
      for (const match of source.matchAll(/\.rpc\(\s*([^,)\s]*)/g)) {
        const arg = match[1] as string;
        expect(arg, `${rel(file)}: rpc name must be a plain string literal`).toMatch(/^"[a-z_]+"$/);
        used.add(arg.slice(1, -1));
      }
    }
    expect([...used].sort()).toEqual(ALLOWED_RPC);
  });

  it("every table is named by a plain string literal, so the write guard above cannot be sidestepped by a variable", () => {
    for (const [file, source] of sources) {
      for (const match of source.matchAll(/\.from\(\s*([^)\s]*)/g)) {
        expect(match[1], `${rel(file)}: .from(...) must take a plain string literal`).toMatch(/^"[a-z_]+"/);
      }
    }
  });

  it("the browser-safe entry reaches no server-only code, no database client and no node: module", () => {
    const reached = reachable([join(MODULE, "client.ts")]);
    for (const [file, source] of reached) {
      expect(source, file).not.toMatch(/server-only|@supabase\/|supabase\/(server|service|browser)|node:/);
    }
    expect(reached.size).toBeGreaterThan(1);
  });

  it("the arithmetic files are pure: no database client, no clock, no randomness", () => {
    for (const name of ["summary.ts", "journal.ts", "chain.ts", "trading-days.ts"]) {
      const source = sources.find(([f]) => rel(f) === name)?.[1] ?? "";
      expect(source.length, name).toBeGreaterThan(0);
      expect(source, name).not.toMatch(/@\/lib\/supabase|new Date\(\)|Date\.now|Math\.random|\bfetch\(/);
    }
  });
});
