import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Plan 4 Task 3 and Global Constraints: the learning graph is built from his own links and his dated notes; no LLM, OCR or
// transcriber port anywhere; the module never holds the secret-key client; it never reaches the ledger, case or valuation modules;
// and the public side never reaches it (the public concept views are built from the cached snapshot in modules/showcase).
const SRC = resolve(__dirname, "../..");
const MODULE = __dirname;

const asFile = (base: string) => (existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(`${base}.tsx`) ? `${base}.tsx` : join(base, "index.ts"));
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
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

const files = sourceFiles(MODULE);
const sources = files.map((f) => [f, strip(readFileSync(f, "utf8"))] as const);
const rel = (f: string) => f.slice(MODULE.length + 1).replaceAll("\\", "/");
const norm = (p: string) => p.replaceAll("\\", "/");

describe("the knowledge module's boundaries", () => {
  it("finds its own source files", () => {
    expect(files.map(rel)).toEqual(expect.arrayContaining(["index.ts", "actions.ts", "client.ts", "service.ts", "repo.ts", "types.ts"]));
  });

  it("names no provider port: no LLM, no OCR, no transcriber (the groupings and suggestions are arithmetic)", () => {
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
    const paths = [...reachable(files, ["@/modules/identity"]).keys()].map(norm);
    expect(paths.some((p) => p.endsWith("lib/supabase/service.ts"))).toBe(false);
    expect(paths.some((p) => p.endsWith("lib/env.server.ts"))).toBe(false);
    expect(paths.some((p) => p.includes("lib/providers/"))).toBe(false);
  });

  it("never reaches the ledger, case, valuation or showcase modules", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/@\/modules\/(ledger|cases|valuation|showcase)\b/);
    }
    const paths = [...reachable(files, ["@/modules/identity"]).keys()].map(norm);
    for (const banned of ["modules/ledger/", "modules/cases/", "modules/valuation/", "modules/showcase/"]) {
      expect(paths.some((p) => p.includes(banned)), banned).toBe(false);
    }
  });

  it("only the actions file imports the identity module, and only to check the admin", () => {
    const importers = sources.filter(([, source]) => /@\/modules\/identity/.test(source)).map(([f]) => rel(f));
    expect(importers).toEqual(["actions.ts"]);
  });

  it("the pure client file is browser-safe: no server-only, database, module or next import", () => {
    const client = sources.find(([f]) => rel(f) === "client.ts")?.[1] ?? "";
    expect(client.length).toBeGreaterThan(0);
    expect(client).not.toMatch(/server-only|@\/lib\/supabase|@\/modules\/|from "next|node:/);
  });

  it("reads only the view concept_links and the table concept_edges, by literal name, and writes only the edges", () => {
    const tables = new Set<string>();
    for (const [file, source] of sources) {
      for (const match of source.matchAll(/\.from\(\s*([^)\s]*)/g)) {
        expect(match[1], `${rel(file)}: .from(...) must take a plain string literal`).toMatch(/^"[a-z_]+"/);
        tables.add((match[1] as string).replace(/"/g, "").replace(/\).*$/, ""));
      }
      expect(source, rel(file)).not.toMatch(/\.from\("(themes|items|item_revisions|concept_links)"\)\s*\.(insert|update|upsert|delete)/);
      expect(source, rel(file)).not.toMatch(/\.rpc\(/);
    }
    expect([...tables].sort()).toEqual(["concept_edges", "concept_links"]);
  });

  it("the public side never reaches it: nothing under showcase, the public routes or the public components imports @/modules/knowledge", () => {
    const roots = [join(SRC, "modules/showcase"), join(SRC, "app/(public)")].filter((d) => existsSync(d));
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/@\/modules\/knowledge/);
      }
    }
    const reached = [...reachable(roots.flatMap((r) => sourceFiles(r)), ["@/modules/identity"]).keys()].map(norm);
    expect(reached.some((p) => p.includes("modules/knowledge/"))).toBe(false);
  });
});
