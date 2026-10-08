import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Anchored to this file (src/modules/showcase), not the working directory.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// import/export ... from "x", bare import "x", dynamic import("x") and require("x").
const FROM = /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/** The table, the panel and the reader of the private digest (Plan 2b Task 7). */
const DIGESTS = /document_digests|DigestPanel|readDigest|digest-panel|digest-read|digest-view/;

/** The generated database types name every table; they hold no query, so they are not read for this rule. */
const GENERATED = /database\.types\.ts$/;

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(existsSync) ?? null;
}

/** Every first-party file reachable from `entry` through import and re-export statements. */
function closure(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const text = readFileSync(file, "utf8");
    seen.set(file, text);
    for (const m of text.matchAll(FROM)) {
      const next = resolveSpec(m[1] ?? m[2] ?? m[3], file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("rule 10: public code paths use only the cookie-less public client", () => {
  const files = closure(join(ROOT, "modules/showcase/index.ts"));
  const names = [...files.keys()].map((f) => f.slice(ROOT.length + 1).replaceAll("\\", "/"));

  it("the walker sees static, re-export, side-effect, dynamic and require specifiers", () => {
    const text = `import a from "@/a"; export { b } from "./b"; import "./c"; const d = await import("@/lib/supabase/service"); const e = require("./e");`;
    expect([...text.matchAll(FROM)].map((m) => m[1] ?? m[2] ?? m[3])).toEqual(["@/a", "./b", "./c", "@/lib/supabase/service", "./e"]);
  });

  it("walks the real import graph (guards the walker itself)", () => {
    expect(names).toEqual(expect.arrayContaining(["modules/showcase/queries.ts", "modules/casefile/view.ts", "modules/capture/streak-view.ts", "lib/supabase/public.ts"]));
  });

  it("nothing reachable from @/modules/showcase imports the service client or the server secrets", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    expect(names).not.toContain("lib/env.server.ts");
    for (const [file, text] of files) {
      expect(text, file).not.toMatch(/supabase\/service|env\.server["']|SERVICE_ROLE|sb_secret/);
    }
  });

  it("nothing reachable from @/modules/showcase reads or shows the machine-read digests", () => {
    expect(names.filter((n) => /digest/i.test(n))).toEqual([]);
    for (const [file, text] of files) if (!GENERATED.test(file)) expect(text, file).not.toMatch(DIGESTS);
  });

  it("the cached snapshot reads through createSupabasePublicClient", () => {
    const queries = files.get(join(ROOT, "modules/showcase/queries.ts"))!;
    expect(queries).toContain("createSupabasePublicClient(");
    expect(queries).not.toMatch(/createSupabase(Server|Service|Admin)Client/);
  });
});

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("rule 10 (Plan 1B): the public routes reach no secret, whatever they import", () => {
  const entries = [
    ...walkFiles(join(ROOT, "app/(public)")),
    join(ROOT, "app/layout.tsx"),
    join(ROOT, "app/not-found.tsx"),
    join(ROOT, "app/opengraph-image.tsx"),
  ];
  const reach = new Map<string, string>();
  for (const entry of entries) for (const [file, text] of closure(entry)) reach.set(file, text);
  const names = [...reach.keys()].map((f) => f.slice(ROOT.length + 1).replaceAll("\\", "/"));

  it("finds the public pages and the components under them", () => {
    expect(names).toEqual(expect.arrayContaining(["app/layout.tsx", "app/(public)/page.tsx", "app/(public)/about/page.tsx", "app/(public)/companies/[slug]/page.tsx",
      "app/(public)/companies/[slug]/opengraph-image.tsx", "components/desk/file-sections.tsx", "components/desk/public-frame.tsx", "modules/showcase/queries.ts"]));
  });

  it("no public route reads or shows the machine-read digests (document_digests is admin-read only)", () => {
    expect(names.filter((n) => /digest/i.test(n))).toEqual([]);
    for (const [file, text] of reach) if (!GENERATED.test(file)) expect(text, file).not.toMatch(DIGESTS);
  });

  it("no public route imports the service client or the server secrets", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    expect(names).not.toContain("lib/env.server.ts");
    for (const [file, text] of reach) expect(text, file).not.toMatch(/supabase\/service|env\.server["']|SERVICE_ROLE|sb_secret/);
  });
});
