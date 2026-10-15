import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Plan 3b Global Constraints: no LLM, OCR or transcriber anywhere in drafting a case study; the module never holds the secret-key
// client; the public side never reaches it (the rule-9 fence is also in showcase/isolation.test.ts, Task 3).
const SRC = resolve(__dirname, "../..");
const MODULE = __dirname;

const asFile = (base: string) => (existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(`${base}.tsx`) ? `${base}.tsx` : join(base, "index.ts"));
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function moduleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return moduleFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

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

describe("the cases module's boundaries", () => {
  it("finds its own source files", () => {
    expect(files.map(rel)).toEqual(expect.arrayContaining(["index.ts", "actions.ts", "service.ts", "repo.ts", "errors.ts", "types.ts"]));
  });

  it("names no provider port: no LLM, no OCR, no transcriber", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/@\/lib\/providers|\bLlmPort\b|\bOcrPort\b|\bTranscriberPort\b|\bMarketDataPort\b|\bAnchorPort\b/);
    }
  });

  it("imports no secret-key client and reads no secret", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/supabase\/service|env\.server|SUPABASE_SECRET_KEY|CRON_SECRET|process\.env/);
    }
  });

  it("nothing it can reach at run time is the service client, the server env or a provider", () => {
    // `@/modules/identity` signs the admin in from the server env; that is identity's business and is not followed.
    const reached = reachable(files, ["@/modules/identity"]);
    const paths = [...reached.keys()].map((p) => p.replaceAll("\\", "/"));
    expect(paths.some((p) => p.endsWith("lib/supabase/service.ts"))).toBe(false);
    expect(paths.some((p) => p.endsWith("lib/env.server.ts"))).toBe(false);
    expect(paths.some((p) => p.includes("lib/providers/"))).toBe(false);
  });

  it("only the actions file imports the identity module, and only to check the admin", () => {
    const importers = sources.filter(([, source]) => /@\/modules\/identity/.test(source)).map(([f]) => rel(f));
    expect(importers).toEqual(["actions.ts"]);
  });

  it("calls only the two case study doors, each named by a literal, and writes no ledger table", () => {
    const used = new Set<string>();
    for (const [file, source] of sources) {
      for (const match of source.matchAll(/\.rpc\(\s*([^,)\s]*)/g)) {
        expect(match[1], `${rel(file)}: rpc name must be a plain string literal`).toMatch(/^"[a-z_]+"$/);
        used.add((match[1] as string).slice(1, -1));
      }
      for (const match of source.matchAll(/\.from\(\s*([^)\s]*)/g)) {
        expect(match[1], `${rel(file)}: .from(...) must take a plain string literal`).toMatch(/^"[a-z_]+"/);
      }
      expect(source, rel(file)).not.toMatch(/\.from\("(idea_events|idea_scores|prices_daily|market_days|ledger_anchors|ideas)"\)/);
      expect(source, rel(file)).not.toMatch(/\.from\("[a-z_]+"\)\s*\.(insert|update|upsert|delete)/);
    }
    expect([...used].sort()).toEqual(["case_study_record", "case_study_switches"]);
  });

  it("the public side never imports it: nothing under showcase, the public routes or components/desk/case reaches @/modules/cases", () => {
    const roots = [join(SRC, "modules/showcase"), join(SRC, "app/(public)"), join(SRC, "components/desk/case")].filter((d) => existsSync(d));
    for (const root of roots) {
      for (const file of moduleFiles(root)) {
        expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/@\/modules\/cases/);
      }
    }
    expect(roots.length).toBeGreaterThan(0);
  });
});
