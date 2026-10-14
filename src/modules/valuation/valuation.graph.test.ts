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

  it("the three files that load a native or parsing library are server-only", () => {
    for (const name of ["read-workbook.ts", "engine-node.ts", "zip-scan.ts", "build-model.ts", "tokens.ts"]) {
      expect(text(join(MODULE, name)), name).toMatch(/^import "server-only";/);
    }
  });

  it("the browser-safe files import no server library, no node: module and no server-only", () => {
    for (const name of ["limits.ts", "types.ts", "addr.ts", "format.ts", "sensitivity.ts", "values.ts", "versions.ts", "cost.ts", "refusal.ts", "engine-client.ts"]) {
      const source = text(join(MODULE, name));
      expect(source, name).not.toMatch(/from\s+["'](?:node:|server-only|xlsx|@ironcalc\/nodejs)/);
    }
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

  it("no log call in the module (nothing from a workbook reaches a log)", () => {
    for (const file of sources) expect(text(file), rel(file)).not.toMatch(/\bconsole\.(?:log|info|warn|error|debug)\b/);
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
