import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-004 s4.2: no ingestion, documents or inbox code can write a revision or an item. Layer 2 of three
// (layer 1: service_role grants + trigger, pgTAP 0006; layer 3: proposals trigger, pgTAP 0007).
const SRC = resolve(__dirname, "../..");
const ROOTS = ["modules/ingestion", "modules/documents", "app/desk/inbox"];
const FORBIDDEN = [
  /\baddRevision\b/, /\bappendRevision\b/, /\bcreateItem\b/, /\bcreateSupabaseResearchRepo\b/,
  /from\s+"@\/modules\/casefile\/actions"/, /from\s+"@\/modules\/research\/actions"/, /\.from\("item_revisions"\)/, /\.from\("items"\)/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const source = (file: string) => readFileSync(file, "utf8");

describe("machine write boundary (ADR-004 s4.2)", () => {
  const byRoot = ROOTS.map((root) => {
    const dir = join(SRC, root);
    return { root, dir, files: existsSync(dir) ? files(dir) : [] };
  });
  const sources = byRoot.flatMap((r) => r.files);

  it.each(ROOTS)("finds the code it guards under %s", (root) => {
    const entry = byRoot.find((r) => r.root === root);
    expect(existsSync(entry?.dir ?? ""), `${root} must exist`).toBe(true);
    expect(entry?.files.length, `${root} must contain source files`).toBeGreaterThan(0);
  });

  for (const pattern of FORBIDDEN) {
    it(`no ingestion, documents or inbox file matches ${pattern}`, () => {
      const offenders = sources.filter((file) => pattern.test(source(file))).map((file) => relative(SRC, file).split(sep).join("/"));
      expect(offenders).toEqual([]);
    });
  }

  it("the patterns would catch a real offender (the guard is not vacuous)", () => {
    const research = source(join(SRC, "modules/casefile/actions.ts"));
    expect(FORBIDDEN.some((p) => p.test(research))).toBe(true);
  });

  it("job steps never import a cookie-session client: they run on the Db ops hands them", () => {
    const steps = sources.filter((f) => f.includes(`${sep}steps${sep}`));
    expect(steps.length).toBeGreaterThan(0);
    const offenders = steps.filter((f) => /@\/lib\/supabase\/(server|browser|service)/.test(source(f)));
    expect(offenders).toEqual([]);
  });

  it("job code never sets documents.status: the machine documents repo has no update (done and skipped are Aksh's)", () => {
    const jobCode = sources.filter((f) => f.includes(`${sep}ingestion${sep}`) && !f.includes(`${sep}actions${sep}`));
    const offenders = jobCode.filter((f) => /documents\.update\b|\.from\("documents"\)\s*\.update/.test(source(f)));
    expect(offenders).toEqual([]);
  });
});
