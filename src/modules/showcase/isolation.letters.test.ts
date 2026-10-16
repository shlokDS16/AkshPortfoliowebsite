import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Anchored to this file (src/modules/showcase), not the working directory. The walker is the one in isolation.test.ts, restated so each file stays small.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FROM = /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
const GENERATED = /database\.types\.ts$/;

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(existsSync) ?? null;
}

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

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Phase 5c Task 14 (binding rules of the reports T10 to T13). The public letters pages, the sign-up, confirm and leave forms, and every derived surface that
// lists a letter stay inside the public boundary:
//  1. Public code imports the reader's three doors from `distribution/public-actions.ts` and the words from `distribution/public.ts`, and nothing else of the
//     module. In particular never `distribution/actions.ts` (the desk's writes: requireAdmin, the ops job entry, send-rpc and with it the secret-key client).
//  2. What those two files reach is a closed list; the secret-key client, the cookie client, the admin session and the job code are not on it.
//  3. The only database doors public code names are the four letters functions anon may execute (plus the two the snapshot already uses).
describe("Phase 5c: public letters code stays inside the public boundary", () => {
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const publicComponents = readdirSync(join(ROOT, "components/desk"), { withFileTypes: true }).filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).map((e) => join(ROOT, "components/desk", e.name));
  const own = [
    ...walkFiles(join(ROOT, "app/(public)")), ...walkFiles(join(ROOT, "modules/showcase")), ...publicComponents,
    join(ROOT, "app/sitemap.ts"), join(ROOT, "app/feed.xml/route.ts"), join(ROOT, "app/robots.ts"), join(ROOT, "app/layout.tsx"),
    ...walkFiles(join(ROOT, "app")).filter((f) => /opengraph-image\.tsx$/.test(f)),
  ].filter((f) => !/\.test\.tsx?$/.test(f));
  const reach = new Map<string, string>();
  for (const entry of own) for (const [file, text] of closure(entry)) reach.set(file, text);
  const names = [...reach.keys()].map(relative);
  const importsOf = (text: string) => [...text.matchAll(FROM)].map((m) => m[1] ?? m[2] ?? m[3]);
  const OWN_PUBLIC = /modules\/showcase\/|app\/|components\/desk\/[^/]+$/;

  it("covers the letters pages, the forms and the new components", () => {
    expect(own.map(relative)).toEqual(
      expect.arrayContaining([
        "app/(public)/letters/page.tsx", "app/(public)/letters/[slug]/page.tsx", "app/(public)/letters/[slug]/opengraph-image.tsx", "app/(public)/letters/confirm/page.tsx",
        "app/(public)/letters/leave/page.tsx", "app/(public)/letters/form-actions.ts", "components/desk/letter-article.tsx", "components/desk/signup-form.tsx", "modules/showcase/letters.ts",
      ]),
    );
  });

  it("no public file imports the desk's actions, the send door, the module index or the job entry of the distribution module", () => {
    const specs = [...reach.entries()].filter(([f]) => OWN_PUBLIC.test(relative(f))).flatMap(([, text]) => importsOf(text));
    expect(specs.filter((spec) => /distribution\/(?:actions|send-rpc|index|client)\b|@\/modules\/distribution["']$/.test(spec))).toEqual([]);
    expect(specs.filter((spec) => /modules\/distribution/.test(spec))).not.toEqual([]);
    expect([...new Set(specs.filter((spec) => /modules\/distribution/.test(spec)))].sort()).toEqual(["@/modules/distribution/public", "@/modules/distribution/public-actions"]);
  });

  it("reaches exactly four files of the distribution module, none of them server-side job or desk code", () => {
    expect(names.filter((n) => /^modules\/distribution\//.test(n)).sort()).toEqual([
      "modules/distribution/letters/copy.ts", "modules/distribution/letters/signup.ts", "modules/distribution/public-actions.ts", "modules/distribution/public.ts",
    ]);
    expect(names).not.toContain("modules/distribution/actions.ts");
    expect(names).not.toContain("modules/distribution/send-rpc.ts");
    expect(names).not.toContain("modules/distribution/index.ts");
  });

  it("reaches no secret-key client, no cookie client, no admin session, no job code and no private desk component", () => {
    expect(names).not.toContain("lib/supabase/service.ts");
    expect(names).not.toContain("lib/supabase/server.ts");
    expect(names.filter((n) => /^modules\/(?:ops|identity|ledger|cases|valuation|knowledge|ingestion|documents|compliance\/gate)/.test(n) || /^components\/desk\/private\//.test(n))).toEqual([]);
  });

  it("reads the server env in three places only: robots.ts (VERCEL_ENV), the form ticket's key (CRON_SECRET) and two plain answers about the letters settings", () => {
    const readers = [...reach.entries()].filter(([, text]) => /env\.server["']/.test(text)).map(([f]) => relative(f)).sort();
    expect(readers).toEqual(["app/robots.ts", "lib/letters-config.ts", "lib/letters-form.ts"]);
    const form = reach.get(join(ROOT, "lib/letters-form.ts"))!;
    expect([...form.matchAll(/serverEnv\(\)\.(\w+)/g)].map((m) => m[1])).toEqual(["CRON_SECRET", "CRON_SECRET"]);
    // letters-config.ts hands out a boolean and a contact address: it reads the whole env only to pass it to the pure mode function, and imports no adapter.
    const config = reach.get(join(ROOT, "lib/letters-config.ts"))!;
    expect([...config.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]).sort()).toEqual(["./env.server", "./providers/letters-mode"]);
    expect(names).toContain("lib/providers/letters-mode.ts");
  });

  it("the public side reaches no letters adapter, only the pure mode file (review finding 8)", () => {
    for (const adapter of ["index", "letters", "letters-guard", "resend-letters", "fixture-letters"]) expect(names, adapter).not.toContain(`lib/providers/${adapter}.ts`);
    expect(names).toContain("lib/providers/letters-mode.ts");
  });

  it("names no private letters table, function or setting; the only doors are the four anon functions", () => {
    const PRIVATE_LETTERS =
      /from\(\s*["'](?:subscribers|subscriber_events|letter_sends)|subscriber_events|letter_sends|confirmed_subscribers|letters_issue_confirmations|letters_confirmation_failed|letters_bin|letters_erase|letters_purge|letters_mark_left|approve_letter_send|cancel_letter_send|claim_letter_send|finish_letter_send|set_letters_signup|letters_send_live|letters_pepper|RESEND_LETTERS_KEY|LETTERS_SEGMENT_ID|LETTERS_FROM|api\.resend\.com/;
    for (const bad of ["from(\"subscribers\")", "letter_sends", "approve_letter_send", "letters_pepper", "RESEND_LETTERS_KEY", "api.resend.com"]) expect(bad).toMatch(PRIVATE_LETTERS);
    for (const ok of ["letters_open", "letters_request", "letters_confirm", "letters_leave", "public_items"]) expect(ok).not.toMatch(PRIVATE_LETTERS);
    for (const [file, text] of reach) if (!GENERATED.test(file) && !/^(?:lib\/env\.server|lib\/providers\/letters-mode|modules\/distribution\/letters\/copy)\.ts$/.test(relative(file))) expect(text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""), relative(file)).not.toMatch(PRIVATE_LETTERS);
    const doors = new Set<string>();
    for (const [file, text] of reach) {
      if (!OWN_PUBLIC.test(relative(file)) && relative(file) !== "modules/distribution/public-actions.ts") continue;
      for (const m of text.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)) doors.add(m[1]);
    }
    expect([...doors].sort()).toEqual(["capture_days", "letters_confirm", "letters_leave", "letters_open", "letters_request", "public_fact_checks"]);
  });

  it("the public side keeps its words in public.ts: no page types the sign-up notice or the answers itself", () => {
    const pages = walkFiles(join(ROOT, "app/(public)/letters")).filter((f) => !/\.test\.tsx?$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(6);
    for (const file of pages) expect(readFileSync(file, "utf8"), relative(file)).not.toMatch(/Get an email when|Thanks\. Aksh sends|You will get the next letter|Done\. If a letter/);
  });

  it("the letters pages add no client component: the forms are plain forms posting to a server action", () => {
    const files = [...walkFiles(join(ROOT, "app/(public)/letters")), ...["signup-form", "reader-forms", "letter-article", "letter-index"].map((n) => join(ROOT, `components/desk/${n}.tsx`))].filter((f) => !/\.test\.tsx?$/.test(f));
    for (const file of files) expect(readFileSync(file, "utf8"), relative(file)).not.toMatch(/^["']use client["']/);
  });

  it("the confirm and leave pages are never cached, and the sign-up page is rendered per request (its ticket carries the render time)", () => {
    for (const page of ["letters/page.tsx", "letters/confirm/page.tsx", "letters/leave/page.tsx"]) {
      expect(readFileSync(join(ROOT, `app/(public)/${page}`), "utf8"), page).toMatch(/export const dynamic = "force-dynamic"/);
    }
    for (const page of ["letters/confirm/page.tsx", "letters/leave/page.tsx"]) {
      const text = readFileSync(join(ROOT, `app/(public)/${page}`), "utf8");
      expect(text, page).toMatch(/robots:\s*{\s*index:\s*false/);
    }
    expect(readFileSync(join(ROOT, "app/(public)/letters/confirm/page.tsx"), "utf8")).toMatch(/referrer:\s*"no-referrer"/);
  });

  it("the sign-up switch is read through the cached query: the snapshot's tag and a five-minute life", () => {
    const queries = readFileSync(join(ROOT, "modules/showcase/queries.ts"), "utf8");
    const block = queries.slice(queries.indexOf("export const getLettersOpen"));
    expect(block).toContain("createSupabasePublicClient()");
    expect(block).toContain("tags: [CACHE_TAGS.publicItems]");
    expect(block).toContain("revalidate: 300");
  });
});
