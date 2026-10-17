import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { closure, GENERATED, ROOT, walkFiles } from "./isolation-walk";

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
