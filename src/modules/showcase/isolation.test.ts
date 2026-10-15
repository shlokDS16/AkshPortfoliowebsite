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

/** The machine's test readings, their review list and their filing (Plan 2b Task 8): private, admin-read only, never a public line. */
const READINGS = /reading_proposals|ReadingRows|reading-rows|readings-filing|recordFiledReadings|listStagedReadingsForItem|machineReadingSchema/;

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

  it("no public route reads or shows the machine's test readings (reading_proposals is admin-read only)", () => {
    expect(names.filter((n) => /reading-rows|readings-filing|review-readings|readings.ts/.test(n))).toEqual([]);
    for (const [file, text] of reach) if (!GENERATED.test(file)) expect(text, file).not.toMatch(READINGS);
  });

  it("rule 9: no public route reaches the valuation module, its components or a model page", () => {
    expect(names.filter((n) => /^(?:modules\/valuation|components\/desk\/private\/models)(?:\/|$)/.test(n))).toEqual([]);
    for (const [file, text] of reach) if (!GENERATED.test(file)) expect(text, file).not.toMatch(/\/desk\/models|valuation_(?:versions|cells|scenarios)/);
  });

  it("no public route imports the service client or the server secrets", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    expect(names).not.toContain("lib/env.server.ts");
    for (const [file, text] of reach) expect(text, file).not.toMatch(/supabase\/service|env\.server["']|SERVICE_ROLE|sb_secret/);
  });
});

// Plan 3b: the ledger is private. Public code reads the cached public snapshot and the record that is already in a published
// revision; it never reaches the ledger's module, tables or admin functions (engineering rule 9).
describe("Plan 3b: public case-study code never reaches the ledger", () => {
  const LEDGER = /idea_events|idea_scores|prices_daily|market_days|ledger_anchors|corporate_actions|ledger_uploads|case_study_record|case_study_switches/;
  const PRIVATE = /^(?:modules\/(?:ledger|cases|valuation|knowledge)|components\/desk\/private)(?:\/|$)/;
  const own = [...walkFiles(join(ROOT, "app/(public)")), ...walkFiles(join(ROOT, "modules/showcase")), ...walkFiles(join(ROOT, "components/desk/case"))].filter(
    (f) => !/\.test\.tsx?$/.test(f),
  );
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const reach = new Map<string, string>();
  for (const entry of own) for (const [file, text] of closure(entry)) reach.set(file, text);

  it("covers the case pages, the case components and the view builder", () => {
    expect(own.map(relative)).toEqual(
      expect.arrayContaining(["app/(public)/cases/page.tsx", "app/(public)/cases/[slug]/page.tsx", "components/desk/case/case-page.tsx", "components/desk/case/fingerprint-check.tsx", "modules/showcase/case-study.ts"]),
    );
  });

  it("their own files, and every file they reach, name no ledger table, no upload or anchor table and neither admin function", () => {
    for (const file of own) expect(readFileSync(file, "utf8"), relative(file)).not.toMatch(LEDGER);
    for (const [file, text] of reach) if (!GENERATED.test(file)) expect(text, relative(file)).not.toMatch(LEDGER);
  });

  it("nothing they import, however deep, is the ledger, cases or valuation module or a private desk component", () => {
    expect([...reach.keys()].map(relative).filter((n) => PRIVATE.test(n))).toEqual([]);
    expect(reach.has(join(ROOT, "lib/supabase/service.ts"))).toBe(false);
  });

  it("the only client component of the case page is the fingerprint check", () => {
    const clients = walkFiles(join(ROOT, "components/desk/case"))
      .filter((f) => !/\.test\.tsx?$/.test(f) && /^["']use client["']/.test(readFileSync(f, "utf8")))
      .map(relative);
    expect(clients).toEqual(["components/desk/case/fingerprint-check.tsx"]);
  });
});

// Plan 4: anon reads `item_revisions.concept_ids`, `public_concept_links` and `public_themes` and nothing else about concepts. His private
// links (`concept_edges`), the admin view over every latest revision (`concept_links`) and a concept's description are never named by
// public code, and public code never imports the knowledge module (which reads them).
describe("Plan 4: public concept code never reaches the private learning graph", () => {
  const PRIVATE_GRAPH = /concept_edges|(?<![A-Za-z_])concept_links\b|description_md|descriptionMd/;
  const KNOWLEDGE = /^modules\/knowledge(?:\/|$)|^components\/desk\/private\//;
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const publicComponents = readdirSync(join(ROOT, "components/desk"), { withFileTypes: true }).filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).map((e) => join(ROOT, "components/desk", e.name));
  const own = [...walkFiles(join(ROOT, "app/(public)")), ...walkFiles(join(ROOT, "modules/showcase")), ...walkFiles(join(ROOT, "components/desk/case")), ...publicComponents].filter(
    (f) => !/\.test\.tsx?$/.test(f),
  );
  const reach = new Map<string, string>();
  for (const entry of own) for (const [file, text] of closure(entry)) reach.set(file, text);

  it("covers the concept pages, the Concepts line and the builder", () => {
    expect(own.map(relative)).toEqual(
      expect.arrayContaining(["app/(public)/concepts/page.tsx", "app/(public)/concepts/[slug]/page.tsx", "components/desk/concept-line.tsx", "components/desk/concept-page.tsx", "modules/showcase/concepts.ts"]),
    );
  });

  it("the walker would catch each private name, and does not mistake the public view for the admin one", () => {
    for (const bad of ["concept_edges", "from('concept_links')", "description_md", "descriptionMd"]) expect(bad).toMatch(PRIVATE_GRAPH);
    expect("public_concept_links").not.toMatch(PRIVATE_GRAPH);
  });

  it("their own files name no edge, no admin concept view and no description", () => {
    for (const file of own) expect(readFileSync(file, "utf8"), relative(file)).not.toMatch(PRIVATE_GRAPH);
  });

  it("nothing they import, however deep, is the knowledge module or a private desk component, and nothing they reach names those relations", () => {
    expect([...reach.keys()].map(relative).filter((n) => KNOWLEDGE.test(n))).toEqual([]);
    // Transitive reach includes shared barrels (the capture module's own import of the catalog). Every reached file is checked for the
    // private relations and columns; exactly one names them, the catalog file that owns the description column. The public side
    // reaches the catalog barrel through capture and never calls it (the import check below pins that no public file names it).
    const naming = [...reach.entries()].filter(([f, text]) => !GENERATED.test(f) && PRIVATE_GRAPH.test(text)).map(([f]) => relative(f)).sort();
    expect(naming).toEqual(["modules/catalog/concepts.ts"]);
    const imported = [...reach.entries()].filter(([f]) => /modules\/showcase\/|app\/\(public\)\//.test(relative(f))).flatMap(([, text]) => [...text.matchAll(FROM)].map((m) => m[1] ?? m[2] ?? m[3]));
    expect(imported.filter((spec) => /modules\/(knowledge|catalog)(?:\/|$)/.test(spec))).toEqual([]);
  });

  it("reads concepts only through the two public views and the revision column", () => {
    const repo = readFileSync(join(ROOT, "modules/showcase/repo.ts"), "utf8");
    expect(repo).toContain('from("public_themes")');
    expect(repo).toContain('from("public_concept_links")');
    expect(repo).not.toMatch(/from\("(?:themes|concept_edges|concept_links)"\)/);
    expect(readFileSync(join(ROOT, "modules/showcase/repo.ts"), "utf8").match(/CONCEPT_COLUMNS = "([^"]+)"/)![1]).toBe("id, slug, name");
  });
});

// Phase 5a (spec s4.1, rule 11): the derived surfaces (metadata, structured data, the feed, the sitemap, robots, share cards) are built
// from the public snapshot and nothing else. They reach no desk module, no cookie client and no service client; `@/modules/distribution`
// does not exist yet, and when it does only its `public` entry (pure renderers) may be reached from here.
describe("Phase 5a: derived public surfaces stay inside the public boundary", () => {
  // compliance and catalog are reached through shared barrels today (the existing walkers above accept it and pin that no public file names the catalog).
  const DESK_ONLY = /^(?:modules\/(?:ledger|cases|valuation|knowledge|distribution|ops|identity|ingestion|documents)|components\/desk\/private)(?:\/|$)/;
  const DISTRIBUTION_PUBLIC = /^modules\/distribution\/public(?:\.ts|\/)/;
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const entries = [
    "app/sitemap.ts", "app/robots.ts", "app/feed.xml/route.ts", "modules/showcase/seo.ts", "modules/showcase/feed.ts", "modules/showcase/derived-scan.ts",
    "components/desk/json-ld.tsx",
  ].map((e) => join(ROOT, e));
  const ogCards = walkFiles(join(ROOT, "app")).filter((f) => /opengraph-image\.tsx$/.test(f));
  const all = [...entries, ...ogCards];
  const reach = new Map<string, string>();
  for (const entry of all) for (const [file, text] of closure(entry)) reach.set(file, text);
  const names = [...reach.keys()].map(relative);

  it("covers the sitemap, robots, the feed, the builders, the JSON-LD script and every share card", () => {
    expect(all.map(relative)).toEqual(expect.arrayContaining(["app/sitemap.ts", "app/robots.ts", "app/feed.xml/route.ts", "modules/showcase/seo.ts", "modules/showcase/feed.ts", "app/opengraph-image.tsx"]));
    expect(ogCards.length).toBeGreaterThanOrEqual(2);
    expect(names).toEqual(expect.arrayContaining(["modules/showcase/queries.ts", "lib/supabase/public.ts"]));
  });

  it("reach no service client, no cookie client, no desk module and no private desk component", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    expect(names).not.toContain("lib/supabase/server.ts");
    expect(names.filter((n) => DESK_ONLY.test(n) && !DISTRIBUTION_PUBLIC.test(n))).toEqual([]);
    // env.server.ts declares the secrets robots.ts never asks for (checked in the next test), so its own text is the one exception.
    for (const [file, text] of reach) if (relative(file) !== "lib/env.server.ts") expect(text, relative(file)).not.toMatch(/supabase\/service|supabase\/server["']|SERVICE_ROLE|sb_secret/);
  });

  it("only robots.ts reads the server env, and it takes one value: VERCEL_ENV", () => {
    const readers = [...reach.entries()].filter(([, text]) => /env\.server["']/.test(text)).map(([f]) => relative(f));
    expect(readers).toEqual(["app/robots.ts"]);
    const robots = reach.get(join(ROOT, "app/robots.ts"))!;
    expect([...robots.matchAll(/serverEnv\(\)\.(\w+)/g)].map((m) => m[1])).toEqual(["VERCEL_ENV"]);
  });

  it("the new builders and routes name no ledger, digest or reading table", () => {
    for (const entry of entries) expect(readFileSync(entry, "utf8"), relative(entry)).not.toMatch(/idea_events|idea_scores|document_digests|reading_proposals|case_study_record/);
  });
});
