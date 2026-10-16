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
    ...walkFiles(join(ROOT, "app/media")),
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

  it("no public route imports the service client or the server secrets (the one exception: the sign-up form's ticket key, lib/letters-form.ts, Plan 5c)", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    // env.server.ts is reached by two files and no other: lib/letters-form.ts, which reads CRON_SECRET to sign a render-time ticket, and
    // lib/letters-config.ts, which answers two plain questions about the letters settings (isolation.letters.test.ts pins what each reads
    // and that nothing else of the distribution module is reached).
    expect(names.includes("lib/env.server.ts")).toBe(names.includes("lib/letters-form.ts"));
    expect(names.includes("lib/letters-config.ts")).toBe(names.includes("lib/letters-form.ts"));
    for (const [file, text] of reach) {
      // letters-form.ts imports the env; env.server.ts declares every secret by name, so its own text is the other exception.
      if (/\/lib\/(?:letters-form|letters-config|env\.server)\.ts$/.test(file.replaceAll("\\", "/"))) continue;
      expect(text, file).not.toMatch(/supabase\/service|env\.server["']|SERVICE_ROLE|sb_secret/);
    }
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
  const DESK_ONLY = /^(?:modules\/(?:ledger|cases|valuation|knowledge|distribution|ops|identity|ingestion|documents|sources)|components\/desk\/private)(?:\/|$)/;
  // Phase 5d: the sources module's pure public entry (the card builder), the fixed words it prints and the shapes both name. Nothing else of it.
  const SOURCES_PUBLIC = /^modules\/sources\/(?:public|copy|problem-codes)\.ts$/;
  // Plan 5c: the pure renderers and words (public.ts), the reader's three doors (public-actions.ts) and the two files of the letters folder that file reaches.
  const DISTRIBUTION_PUBLIC = /^modules\/distribution\/(?:public(?:-actions)?\.ts|public\/|letters\/(?:signup|copy)\.ts)$/;
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const builders = [
    "app/sitemap.ts", "app/robots.ts", "app/feed.xml/route.ts", "modules/showcase/seo.ts", "modules/showcase/feed.ts", "modules/showcase/derived-scan.ts",
    "components/desk/json-ld.tsx",
  ].map((e) => join(ROOT, e));
  // The public pages and the print components are on the same boundary: a page that imported ops for a date, or the private banner, would leak.
  const pages = [...walkFiles(join(ROOT, "app/(public)")), ...walkFiles(join(ROOT, "app/media")), ...["print-masthead", "print-disclosure", "print-button"].map((n) => join(ROOT, `components/desk/${n}.tsx`))].filter((f) => !/\.test\.tsx?$/.test(f));
  const ogCards = walkFiles(join(ROOT, "app")).filter((f) => /opengraph-image\.tsx$/.test(f));
  const all = [...builders, ...pages, ...ogCards];
  const reach = new Map<string, string>();
  for (const entry of all) for (const [file, text] of closure(entry)) reach.set(file, text);
  const names = [...reach.keys()].map(relative);

  it("covers the sitemap, robots, the feed, the builders, the JSON-LD script and every share card", () => {
    expect(all.map(relative)).toEqual(
      expect.arrayContaining(["app/sitemap.ts", "app/robots.ts", "app/feed.xml/route.ts", "modules/showcase/seo.ts", "modules/showcase/feed.ts", "app/opengraph-image.tsx", "app/(public)/notes/[slug]/page.tsx", "components/desk/print-masthead.tsx"]),
    );
    expect(ogCards.length).toBeGreaterThanOrEqual(2);
    expect(names).toEqual(expect.arrayContaining(["modules/showcase/queries.ts", "lib/supabase/public.ts"]));
  });

  it("reach no service client, no cookie client, no desk module and no private desk component", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    expect(names).not.toContain("lib/supabase/server.ts");
    expect(names.filter((n) => DESK_ONLY.test(n) && !DISTRIBUTION_PUBLIC.test(n) && !SOURCES_PUBLIC.test(n))).toEqual([]);
    // env.server.ts declares the secrets robots.ts never asks for (checked in the next test), so its own text is the one exception.
    for (const [file, text] of reach) if (relative(file) !== "lib/env.server.ts") expect(text, relative(file)).not.toMatch(/supabase\/service|supabase\/server["']|SERVICE_ROLE|sb_secret/);
  });

  it("only robots.ts (VERCEL_ENV), the sign-up form's ticket (lib/letters-form.ts, CRON_SECRET) and the letters settings answers (lib/letters-config.ts) read the server env", () => {
    const readers = [...reach.entries()].filter(([, text]) => /env\.server["']/.test(text)).map(([f]) => relative(f)).sort();
    expect(readers).toEqual(["app/robots.ts", "lib/letters-config.ts", "lib/letters-form.ts"]);
    const robots = reach.get(join(ROOT, "app/robots.ts"))!;
    expect([...robots.matchAll(/serverEnv\(\)\.(\w+)/g)].map((m) => m[1])).toEqual(["VERCEL_ENV"]);
  });

  it("the new builders and routes name no ledger, digest or reading table", () => {
    for (const entry of builders) expect(readFileSync(entry, "utf8"), relative(entry)).not.toMatch(/idea_events|idea_scores|document_digests|reading_proposals|case_study_record/);
  });
});

// Phase 5d (spec s7): the outside sources a company file shows. The block, its builder, the snapshot read and the picture route are the public side of a
// table that holds his private note, the video id, a fetch problem and the hash. They read only the view `public_studied`, import only the pure entry
// of the sources module, and never a cookie client, the service client or the server secrets.
describe("Phase 5d: the outside-sources block and the picture route stay inside the public boundary", () => {
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const entries = [
    ...walkFiles(join(ROOT, "app/media")),
    join(ROOT, "app/(public)/companies/[slug]/page.tsx"),
    join(ROOT, "components/desk/studied-block.tsx"),
    join(ROOT, "modules/showcase/studied.ts"),
    join(ROOT, "modules/showcase/studied-media.ts"),
    join(ROOT, "modules/showcase/repo.ts"),
  ].filter((f) => !/\.test\.tsx?$/.test(f));
  const reach = new Map<string, string>();
  for (const entry of entries) for (const [file, text] of closure(entry)) reach.set(file, text);
  const names = [...reach.keys()].map(relative);
  // The table, its two join tables and the two functions that write it: named by nothing public. The machine's own columns are checked in the files written for this block.
  const PRIVATE_TABLES = /source_links|source_link_companies|source_link_concepts|record_source_fetch|purge_stale_source_data/;
  const PRIVATE_COLUMNS = /fetch_problem|meta_sha|youtube_id|youtubeId/;
  const OWN = /^(?:components\/desk\/studied-block\.tsx|modules\/showcase\/studied(?:-media)?\.ts|modules\/sources\/(?:public|copy|problem-codes)\.ts|app\/media\/.*)$/;
  const DISTRIBUTION_PUBLIC = /^modules\/distribution\/(?:public(?:-actions)?\.ts|public\/|letters\/(?:signup|copy)\.ts)$/;

  it("covers the media route, the block, the builder and the file page", () => {
    expect(entries.map(relative)).toEqual(
      expect.arrayContaining(["app/media/studied/[file]/route.ts", "components/desk/studied-block.tsx", "modules/showcase/studied.ts", "modules/showcase/studied-media.ts"]),
    );
    expect(names).toEqual(expect.arrayContaining(["modules/sources/public.ts", "lib/supabase/public.ts"]));
  });

  it("the only files of the sources module they reach are the pure entry, its words and its problem codes", () => {
    expect(names.filter((n) => n.startsWith("modules/sources/")).sort()).toEqual(["modules/sources/copy.ts", "modules/sources/problem-codes.ts", "modules/sources/public.ts"]);
  });

  it("no cookie client, no service client, no server secret, no desk module and no private desk component is reached", () => {
    for (const n of ["lib/supabase/server.ts", "lib/supabase/service.ts", "lib/env.server.ts"]) expect(names).not.toContain(n);
    expect(names.filter((n) => /^(?:modules\/(?:ledger|cases|valuation|knowledge|distribution|ops|identity|ingestion|documents)|components\/desk\/private)(?:\/|$)/.test(n) && !DISTRIBUTION_PUBLIC.test(n))).toEqual([]);
    for (const [file, text] of reach) expect(text, relative(file)).not.toMatch(/supabase\/service|supabase\/server["']|next\/headers|SERVICE_ROLE|sb_secret/);
  });

  it("they name the private tables nowhere, and the files written for this block name no problem code, hash or video id either", () => {
    // The compliance loader names the table (it reads the words the lint checks); it is reached only through the casefile barrel that the file builders
    // share, as the catalog is in the learning-graph test, and no public file calls it. Every file written for the public side names none.
    const naming = [...reach].filter(([file, text]) => !GENERATED.test(file) && PRIVATE_TABLES.test(text)).map(([file]) => relative(file));
    expect(naming).toEqual(["modules/compliance/repo.ts"]);
    for (const [file, text] of reach) if (/^(?:modules\/showcase|app\/media|app\/\(public\))\//.test(relative(file)) || /^components\/desk\/[^/]+\.tsx$/.test(relative(file))) expect(text, relative(file)).not.toMatch(PRIVATE_TABLES);
    const own = [...reach].filter(([file]) => OWN.test(relative(file)));
    expect(own.length).toBeGreaterThanOrEqual(5);
    for (const [file, text] of own) expect(text, relative(file)).not.toMatch(PRIVATE_COLUMNS);
  });

  it("the snapshot reads outside sources through the public view only, by its explicit column list", () => {
    const repo = reach.get(join(ROOT, "modules/showcase/repo.ts"))!;
    expect(repo).toContain('from("public_studied")');
    expect(repo).toMatch(/STUDIED_COLUMNS = "item_id, position, kind, url, saved_on, note, title, site_name, channel_url, thumb_path, thumb_sha256"/);
  });

  it("the picture route asks storage with the cookie-less public client and nothing else", () => {
    const route = readFileSync(join(ROOT, "app/media/studied/[file]/route.ts"), "utf8");
    expect(route).toContain("createSupabasePublicClient(");
    expect(route).not.toMatch(/createSupabase(Server|Service|Admin)Client|cookies\(/);
    expect(route).toContain('storage.from("source-thumbs")');
  });
});
