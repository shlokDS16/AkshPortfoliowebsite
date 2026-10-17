import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5d global constraints (plan s22-30, spec s6.3 and D113): the sources module reads other people's pages, so what it may reach is
// small and checked here. It holds no LLM, OCR or transcriber port; it never builds the real transport or resolver (the safe fetch's inputs
// come from createLinkFetchDeps, in job code); only outbound.ts calls the safe fetch; it holds no secret-key client, no secret and no
// process.env; it reads neither the ledger nor the valuations; it logs nothing (a link's query string and tokens are not for a log); and
// public.ts, the one file the public side may import, reaches nothing server-side.
const SRC = resolve(__dirname, "../..");
const MODULE = __dirname;

const asFile = (base: string) => (existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(`${base}.tsx`) ? `${base}.tsx` : join(base, "index.ts"));
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const isTest = (name: string) => /\.test\.tsx?$/.test(name);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(entry.name) && !isTest(entry.name) ? [path] : [];
  });
}

/** Every file reachable from `entries` through runtime imports (relative or "@/"; type-only imports are erased). */
function reachable(entries: string[]): Map<string, string> {
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
      else if (spec.startsWith("@/")) queue.push(asFile(resolve(SRC, spec.slice(2))));
    }
  }
  return files;
}

const files = filesUnder(MODULE);
const sources = files.map((f) => [f, strip(readFileSync(f, "utf8"))] as const);
const rel = (f: string) => f.slice(MODULE.length + 1).replaceAll("\\", "/");

describe("the sources module's boundaries", () => {
  it("finds its own source files", () => {
    expect(files.map(rel)).toEqual(expect.arrayContaining(["index.ts", "client.ts", "public.ts", "actions.ts", "outbound.ts", "fetch.ts", "url-key.ts", "page-meta.ts", "service.ts", "repo.ts", "studied.ts"]));
  });

  it("names no LLM, OCR or transcriber port, and none of their vendors", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/\bLlmPort\b|\bOcrPort\b|\bTranscriberPort\b|\bcreateLlmPort\b|\bcreateOcrPort\b|\bcreateTranscriberPort\b|groq|ocrspace|whisper|openai|anthropic/i);
    }
  });

  it("never imports the real transport or resolver, nor a network API of node, and calls no fetch of its own", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/httpsTransport|systemResolver|safe-fetch-transport|createLinkFetchDeps|node:(?:https?|net|dns|tls|http2)\b|\bfrom "https?"|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
    }
  });

  it("only outbound.ts calls the safe fetch", () => {
    expect(sources.filter(([, s]) => /\bsafeFetch\s*\(/.test(s)).map(([f]) => rel(f))).toEqual(["outbound.ts"]);
  });

  it("imports no secret-key client, reads no secret and no process.env", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/supabase\/service|env\.server|SUPABASE_SECRET_KEY|CRON_SECRET|process\.env/);
    }
  });

  it("does not import the ledger or the valuations", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/@\/modules\/(?:ledger|valuation)\b/);
    }
  });

  it("logs nothing: a link, its query string or a token is never written to a log", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/\bconsole\./);
    }
  });

  it("only the actions file imports identity and the job entry", () => {
    expect(sources.filter(([, s]) => /@\/modules\/identity/.test(s)).map(([f]) => rel(f))).toEqual(["actions.ts"]);
    expect(sources.filter(([, s]) => /@\/modules\/ops/.test(s)).map(([f]) => rel(f))).toEqual(["actions.ts"]);
  });

  it("nothing but actions.ts can reach the service client or the server env at run time (the ops job entry is opaque: it is job code)", () => {
    const paths = [...reachable(files.filter((f) => rel(f) !== "actions.ts")).keys()].map((p) => p.replaceAll("\\", "/"));
    expect(paths.some((p) => p.endsWith("lib/supabase/service.ts") || p.endsWith("lib/env.server.ts"))).toBe(false);
  });

  it("the machine's columns are written nowhere in the module: no insert or update names a title, a picture or a hash", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/\.(?:insert|update|upsert)\(\s*\{[^}]*\b(?:title|site_name|channel_url|thumb_path|thumb_sha256|meta_sha|meta_since|fetched_at|checked_at|fetch_problem|gone)\b/s);
    }
  });
});

describe("public.ts, the one file the public side may import", () => {
  const entry = join(MODULE, "public.ts");

  it("reaches nothing but itself and the desk's fixed words", () => {
    const reached = [...reachable([entry]).keys()].map((p) => p.slice(SRC.length + 1).replaceAll("\\", "/"));
    expect(reached.sort()).toEqual(["modules/sources/copy.ts", "modules/sources/public.ts"]);
  });

  it("is pure: no server-only, no database, no cookie, no node API, no environment, no fetch", () => {
    for (const source of reachable([entry]).values()) {
      expect(source).not.toMatch(/server-only|supabase|next\/headers|node:|process\.|\bfetch\s*\(|"use server"|"use client"/);
    }
  });
});

describe("client.ts, the browser-safe entry", () => {
  it("reaches no server-only module, no database and no node API", () => {
    const reached = reachable([join(MODULE, "client.ts")]);
    for (const [file, source] of reached) {
      expect(source, file).not.toMatch(/server-only|supabase|next\/headers|node:|process\./);
    }
    expect([...reached.keys()].map((p) => p.slice(SRC.length + 1).replaceAll("\\", "/")).sort()).toEqual(
      expect.arrayContaining(["modules/distribution/videos/youtube-url.ts", "modules/sources/client.ts", "modules/sources/url-key.ts"]),
    );
  });
});
