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

// Phase 5b (spec s7.7, s9; global constraints): a listed video is public through two anon views and nothing else. Public code names none of
// YouTube's private columns (channel, description, privacy, fetch problem), never imports the distribution module but its pure `public` entry,
// never calls the YouTube API (googleapis.com is youtube.ts only), loads no third-party script, and the only client code a video page adds
// is the click-to-load player.
describe("Phase 5b: public video code stays inside the public boundary", () => {
  const relative = (f: string) => f.slice(ROOT.length + 1).replaceAll("\\", "/");
  const publicComponents = readdirSync(join(ROOT, "components/desk"), { withFileTypes: true }).filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).map((e) => join(ROOT, "components/desk", e.name));
  const own = [
    ...walkFiles(join(ROOT, "app/(public)")), ...walkFiles(join(ROOT, "modules/showcase")), ...publicComponents,
    join(ROOT, "app/sitemap.ts"), join(ROOT, "app/feed.xml/route.ts"), join(ROOT, "app/layout.tsx"),
  ].filter((f) => !/\.test\.tsx?$/.test(f));
  const reach = new Map<string, string>();
  for (const entry of own) for (const [file, text] of closure(entry)) reach.set(file, text);
  const PRIVATE_VIDEO = /(?<![a-z_])video_sources|(?<!public_)video_transcripts|record_video_fetch|yt_description|yt_title|own_channel|channel_id|fetch_problem|YOUTUBE_API_KEY|YOUTUBE_CHANNEL_ID|DISTRIBUTION_ADAPTER/;

  it("the walker would catch each private name, and does not mistake the public views for the private tables", () => {
    for (const bad of ["video_sources", "video_transcripts", "yt_description", "own_channel", "channel_id", "fetch_problem", "YOUTUBE_API_KEY"]) expect(bad).toMatch(PRIVATE_VIDEO);
    for (const ok of ["public_videos", "public_video_transcripts", "youtube_id", "yt_published_at"]) expect(ok).not.toMatch(PRIVATE_VIDEO);
  });

  it("no public file, and none it reaches, names a private YouTube column, table or setting, but the compliance repository", () => {
    // Transitive reach includes shared barrels. Exactly two files name them: the publish gate's repository (it reads a video's own transcript for
    // the lint) and the capture service (a doc comment; it takes the filing as an argument). The public side reaches both through barrels and
    // never calls them (no public file imports the repository by name).
    const naming = [...reach.entries()].filter(([f, text]) => !GENERATED.test(f) && PRIVATE_VIDEO.test(text)).map(([f]) => relative(f)).sort();
    // Plan 5c: and the server env schema, which declares every secret by name; the sign-up form's ticket key (lib/letters-form.ts) is the one public file that reaches it.
    expect(naming).toEqual(["lib/env.server.ts", "modules/capture/service.ts", "modules/compliance/repo.ts"]);
    for (const [file, text] of reach) {
      if (!/modules\/showcase\/|app\/\(public\)\/|components\/desk\/[^/]+$/.test(relative(file))) continue;
      expect([...text.matchAll(FROM)].map((m) => m[1] ?? m[2] ?? m[3]).filter((spec) => /modules\/compliance\/repo/.test(spec)), relative(file)).toEqual([]);
    }
  });

  it("reads videos through the two anon views only, with explicit column lists", () => {
    const repo = readFileSync(join(ROOT, "modules/showcase/repo.ts"), "utf8");
    expect(repo).toContain('from("public_videos")');
    expect(repo).toContain('from("public_video_transcripts")');
    expect(repo).not.toMatch(/from\("video_/);
    expect(repo.match(/VIDEO_COLUMNS = "([^"]+)"/)![1]).toBe("item_id, youtube_id, duration_seconds, yt_published_at");
    expect(repo.match(/VIDEO_TRANSCRIPT_COLUMNS = "([^"]+)"/)![1]).toBe("item_id, segments");
  });

  it("imports nothing of @/modules/distribution but its public entry and the reader's doors, and reaches only those files of the module", () => {
    const specs = [...reach.entries()]
      .filter(([f]) => /modules\/showcase\/|app\/\(public\)\/|components\/desk\/[^/]+$/.test(relative(f)))
      .flatMap(([, text]) => [...text.matchAll(FROM)].map((m) => m[1] ?? m[2] ?? m[3]))
      .filter((spec) => /modules\/distribution/.test(spec));
    expect(specs.length).toBeGreaterThan(0);
    expect([...new Set(specs)].sort()).toEqual(["@/modules/distribution/public", "@/modules/distribution/public-actions"]);
    // Plan 5c: public-actions.ts reaches letters/signup.ts, which reaches letters/copy.ts. isolation.letters.test.ts pins the same list and what is NOT on it.
    expect([...reach.keys()].map(relative).filter((n) => /^modules\/distribution\//.test(n)).sort()).toEqual([
      "modules/distribution/letters/copy.ts", "modules/distribution/letters/signup.ts", "modules/distribution/public-actions.ts", "modules/distribution/public.ts",
    ]);
  });

  it("the YouTube API host is named by the adapter alone, and no public file loads a script from anyone", () => {
    for (const [file, text] of reach) {
      expect(text, relative(file)).not.toMatch(/googleapis\.com|iframe_api|next\/script|<script[^>]+src=/);
    }
  });

  it("the only client component a video adds to the page is the player (the print button is the existing one)", () => {
    const clients = publicComponents
      .filter((f) => /\/video-[a-z-]+\.tsx$/.test(f.replaceAll("\\", "/")) && !/\.test\.tsx?$/.test(f) && /^["']use client["']/.test(readFileSync(f, "utf8")))
      .map(relative);
    expect(clients).toEqual(["components/desk/video-player.tsx"]);
  });
});
