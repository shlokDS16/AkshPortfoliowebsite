import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { REFUSAL_MESSAGES } from "./refusal";

// Plan 2.7 Task 1, spec s4.8 and s9: where the workbook libraries may be imported, what the module may not import, and the words its
// copy may not contain. Source scans, so a later edit that breaks a rule fails here.
const SRC = resolve(__dirname, "../..");
const MODULE = join(SRC, "modules/valuation");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const rel = (file: string) => relative(SRC, file).split(sep).join("/");
const text = (file: string) => readFileSync(file, "utf8");
const importsOf = (pkg: string) => files(SRC).filter((f) => new RegExp(`from\\s+["']${pkg.replace(/[/.]/g, "\\$&")}(?:/[^"']*)?["']|import\\(["']${pkg.replace(/[/.]/g, "\\$&")}["']\\)`).test(text(f)));

describe("where the libraries are imported", () => {
  it("xlsx (SheetJS) only in read-workbook.ts", () => {
    expect(importsOf("xlsx").map(rel)).toEqual(["modules/valuation/read-workbook.ts"]);
  });

  it("@ironcalc/nodejs only in engine-node.ts", () => {
    expect(importsOf("@ironcalc/nodejs").map(rel)).toEqual(["modules/valuation/engine-node.ts"]);
  });

  it("@ironcalc/wasm only in engine-client.ts and tokens.ts", () => {
    expect(importsOf("@ironcalc/wasm").map(rel).sort()).toEqual(["modules/valuation/engine-client.ts", "modules/valuation/tokens.ts"]);
  });

  it("the files that load a native or parsing library, or the database, are server-only", () => {
    for (const name of ["read-workbook.ts", "engine-node.ts", "zip-scan.ts", "build-model.ts", "tokens.ts", "repo.ts", "index.ts", "page-read.ts"]) {
      expect(text(join(MODULE, name)), name).toMatch(/^(?:\/\/[^\n]*\n)*import "server-only";/);
    }
  });

  it("the browser-safe files import no server library, no node: module and no server-only", () => {
    for (const name of ["limits.ts", "types.ts", "addr.ts", "format.ts", "sensitivity.ts", "values.ts", "versions.ts", "cost.ts", "refusal.ts", "engine-client.ts", "records.ts", "copy.ts", "service.ts", "client.ts", "suggest.ts", "views.ts", "engine.ts"]) {
      const source = text(join(MODULE, name));
      expect(source, name).not.toMatch(/from\s+["'](?:node:|server-only|xlsx|@ironcalc\/nodejs)/);
    }
  });
});

describe("how the rest of the app reaches the module", () => {
  it("only through its entry, its client entry or its actions (never a file inside it)", () => {
    const outside = files(SRC).filter((f) => !f.startsWith(MODULE));
    const deep = outside.flatMap((f) => [...text(f).matchAll(/["']@\/modules\/valuation\/([a-z-]+)["']/g)].map((m) => `${rel(f)} -> ${m[1]}`));
    expect(deep.filter((d) => !/-> (?:client|actions|engine)$/.test(d))).toEqual([]);
  });

  it("the engine entry only from the model page's worker, so the wasm glue is in that chunk alone (Task 3, D18)", () => {
    const users = files(SRC).filter((f) => !f.startsWith(MODULE) && /["']@\/modules\/valuation\/engine["']/.test(text(f)));
    expect(users.map(rel)).toEqual(["components/desk/private/models/engine.worker.ts"]);
  });

  it("the client entry never re-exports the engine or its wrapper as a value", () => {
    expect(text(join(MODULE, "client.ts"))).not.toMatch(/export \{[^}]*\bloadEngine\b|export \* from "\.\/engine(?:-client)?"/);
  });
});

describe("what the module does not touch", () => {
  const sources = files(MODULE);

  it("has no model, OCR or transcriber port, no network call and no eval", () => {
    const banned = [/@\/lib\/providers\/(?:llm|ocr|transcriber|groq|ocrspace)/, /\bfetch\s*\(/, /\beval\s*\(/, /new\s+Function\s*\(/, /\.innerHTML\b/, /dangerouslySetInnerHTML/];
    for (const file of sources) for (const pattern of banned) expect(pattern.test(text(file)), `${rel(file)} ${pattern}`).toBe(false);
  });

  it("never reads the environment or a secret, and never uses the service-role client", () => {
    for (const file of sources) {
      expect(text(file), rel(file)).not.toMatch(/process\.env|@\/lib\/env|supabase\/service/);
    }
  });

  it("is not imported by the public site, the showcase or the compliance gate (rule 9)", () => {
    const outside = [...files(join(SRC, "app/(public)")), ...files(join(SRC, "modules/showcase")), ...files(join(SRC, "modules/compliance"))];
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.filter((f) => /@\/modules\/valuation/.test(text(f))).map(rel)).toEqual([]);
  });

  it("no log call in the module but the actions' one, which logs a class name and nothing else (nothing from a workbook reaches a log)", () => {
    const allowed = /console\.error\("valuation action failed", error instanceof Error \? error\.name : "unknown"\);/g;
    for (const file of sources) {
      const source = text(file).replace(file.endsWith("flows.ts") ? allowed : /(?!)/g, "");
      expect(source, rel(file)).not.toMatch(/\bconsole\.(?:log|info|warn|error|debug)\b/);
    }
    expect(text(join(MODULE, "flows.ts")).match(allowed)).toHaveLength(1);
  });

  it("depends on no other feature module but identity (the admin check): ingestion and documents reach it, never the reverse (Plan 2.7)", () => {
    for (const file of sources) expect(text(file), rel(file)).not.toMatch(/from\s+["']@\/modules\/(?!valuation|identity)[a-z-]+/);
  });
});

describe("the module's copy", () => {
  // Spec s7.3: words that would read as advice never appear in the desk's own copy. His own labels are shown as he typed them.
  const BANNED = [/\btarget\b/i, /\bfair value\b/i, /\bintrinsic value\b/i, /\bupside\b/i, /\bprice target\b/i, /\bbuy\b/i, /\bsell\b/i];

  it("no refusal sentence contains one", () => {
    for (const [code, message] of Object.entries(REFUSAL_MESSAGES)) for (const word of BANNED) expect(word.test(message), `${code}: ${word}`).toBe(false);
  });

  it("no string literal in a non-test file contains one", () => {
    for (const file of files(MODULE)) {
      const literals = text(file).match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g) ?? [];
      for (const literal of literals) for (const word of BANNED) expect(word.test(literal), `${rel(file)}: ${literal.slice(0, 60)}`).toBe(false);
    }
  });

  it("every refusal sentence is plain: it names the fix, and ends the way a sentence ends", () => {
    for (const [code, message] of Object.entries(REFUSAL_MESSAGES)) {
      expect(message, code).toMatch(/\.$/);
      expect(message.length, code).toBeLessThan(220);
    }
  });
});
