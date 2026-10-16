import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5 global constraints and spec s9.3: the distribution module holds no LLM, OCR or transcriber port, no secret-key client and no
// secret (the one exception is send-rpc.ts, which hands the secret-key client to the letters' doors for the desk's actions and is imported
// by actions.ts alone); only the YouTube adapter names googleapis.com and it has no method but GET; nothing here reads the ledger or the
// valuations; the letters' broadcast and contact calls are made from one place each; and the one file the public side may import
// (public.ts) reaches nothing server-side.
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

describe("the distribution module's boundaries", () => {
  it("finds its own source files", () => {
    expect(files.map(rel)).toEqual(expect.arrayContaining(["index.ts", "actions.ts", "client.ts", "public.ts", "videos/service.ts", "videos/fetch.ts", "videos/captions.ts"]));
  });

  it("names no LLM, OCR or transcriber port, and none of their vendors", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/\bLlmPort\b|\bOcrPort\b|\bTranscriberPort\b|\bcreateLlmPort\b|\bcreateOcrPort\b|\bcreateTranscriberPort\b|groq|ocrspace|whisper/i);
    }
  });

  it("imports no secret-key client, reads no secret and no process.env (send-rpc.ts alone holds the client)", () => {
    for (const [file, source] of sources) {
      const pattern = rel(file) === "send-rpc.ts" ? /env\.server|SUPABASE_SECRET_KEY|CRON_SECRET|YOUTUBE_API_KEY|process\.env/ : /supabase\/service|env\.server|SUPABASE_SECRET_KEY|CRON_SECRET|YOUTUBE_API_KEY|process\.env/;
      expect(source, rel(file)).not.toMatch(pattern);
    }
  });

  it("send-rpc.ts holds the secret-key client, and only actions.ts imports it", () => {
    expect(sources.find(([f]) => rel(f) === "send-rpc.ts")?.[1]).toMatch(/supabase\/service/);
    expect(sources.filter(([, s]) => /from "(?:\.\/|\.\.\/)+send-rpc"/.test(s)).map(([f]) => rel(f))).toEqual(["actions.ts"]);
  });

  it("does not import the ledger or the valuations", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/@\/modules\/(?:ledger|valuation)\b/);
    }
  });

  it("only the actions file imports identity and the job entry", () => {
    expect(sources.filter(([, s]) => /@\/modules\/identity/.test(s)).map(([f]) => rel(f))).toEqual(["actions.ts"]);
    expect(sources.filter(([, s]) => /@\/modules\/ops/.test(s)).map(([f]) => rel(f))).toEqual(["actions.ts"]);
  });

  it("nothing it can reach at run time is the service client or the server env, except through actions.ts and send-rpc.ts (the ops job entry is opaque: it is job code); public-actions.ts reaches the server env for the form ticket's key and nothing else", () => {
    const paths = (excluded: string[]) => [...reachable(files.filter((f) => !excluded.includes(rel(f)))).keys()].map((p) => p.replaceAll("\\", "/"));
    expect(paths(["actions.ts", "send-rpc.ts"]).some((p) => p.endsWith("lib/supabase/service.ts"))).toBe(false);
    expect(paths(["actions.ts", "send-rpc.ts", "public-actions.ts"]).some((p) => p.endsWith("lib/env.server.ts"))).toBe(false);
  });

  it("the reader's actions (public-actions.ts) reach no admin session, no job code and no secret-key client", () => {
    const paths = [...reachable([join(MODULE, "public-actions.ts")]).keys()].map((p) => p.replaceAll("\\", "/"));
    expect(paths.some((p) => /lib\/supabase\/(?:service|server)\.ts$|modules\/identity|modules\/ops/.test(p))).toBe(false);
    expect(paths.some((p) => p.endsWith("lib/letters-form.ts"))).toBe(true);
  });
});

describe("the letters send only through deliverLetter, and only up to the approval guard", () => {
  const srcFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "test" ? [] : srcFiles(path);
      return /\.(?:ts|tsx|mts|mjs)$/.test(entry.name) && !isTest(entry.name) && !/database\.types\.ts$/.test(entry.name) ? [path] : [];
    });
  const callers = (pattern: RegExp) =>
    srcFiles(SRC)
      .filter((f) => pattern.test(strip(readFileSync(f, "utf8"))))
      .map((f) => f.slice(SRC.length + 1).replaceAll("\\", "/"))
      .sort();

  it("a broadcast is created and sent from one place of the app (deliverLetter), behind the approval guard that wraps the transport", () => {
    expect(callers(/\.sendBroadcast\(/)).toEqual(["lib/providers/letters-guard.ts", "modules/distribution/letters/deliver.ts"]);
    expect(callers(/\.createBroadcast\(/)).toEqual(["lib/providers/letters-guard.ts", "modules/distribution/letters/deliver.ts"]);
  });

  it("a test copy and a confirmation are each sent from one place", () => {
    expect(callers(/\.sendSelfTest\(/)).toEqual(["modules/distribution/letters/deliver.ts"]);
    expect(callers(/\.sendConfirmation\(/)).toEqual(["modules/distribution/letters/readers.ts"]);
    expect(callers(/\.sendOne\(/)).toEqual(["lib/providers/letters-guard.ts"]);
  });

  it("the contact calls (add, delete, list) are made from the reconcile alone", () => {
    expect(callers(/\.(?:upsertContact|deleteContact|listContacts)\(/)).toEqual(["lib/providers/letters-guard.ts", "modules/distribution/letters/readers.ts"]);
  });

  it("the letters ports are built only by the factory and job code (an action never builds one)", () => {
    expect(callers(/createLetterPorts\(/)).toEqual(["lib/providers/index.ts", "modules/ops/letter-steps.ts"]);
  });

  it("nothing in the letters module names Resend's host or the letters settings", () => {
    for (const [file, source] of sources) {
      expect(source, rel(file)).not.toMatch(/api\.resend\.com|RESEND_LETTERS_KEY|LETTERS_FROM|LETTERS_SEGMENT_ID/);
    }
  });
});

describe("public.ts, the one file the public side may import", () => {
  const entry = join(MODULE, "public.ts");

  it("reaches nothing but itself and the shapes file", () => {
    const reached = [...reachable([entry]).keys()].map((p) => p.slice(SRC.length + 1).replaceAll("\\", "/"));
    expect(reached.sort()).toEqual(["modules/distribution/public.ts"]);
  });

  it("has no server-only marker, no node import, no database and no env", () => {
    const text = strip(readFileSync(entry, "utf8"));
    expect(text).not.toMatch(/server-only|node:|@\/lib\/supabase|@\/lib\/env|process\.env|fetch\(/);
  });
});

describe("the YouTube adapter is read-only and the only file that names Google's host", () => {
  const adapter = join(SRC, "lib/providers/youtube.ts");

  function srcFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : srcFiles(path);
      return /\.(?:ts|tsx|mts|mjs)$/.test(entry.name) && !isTest(entry.name) && !/database\.types\.ts$/.test(entry.name) ? [path] : [];
    });
  }

  it("is the only source file (tests and the test setup aside) that names googleapis.com", () => {
    const named = srcFiles(SRC)
      .map((f) => f.slice(SRC.length + 1).replaceAll("\\", "/"))
      .filter((f) => !f.startsWith("test/") && /googleapis\.com/.test(readFileSync(join(SRC, f), "utf8")));
    expect(named).toEqual(["lib/providers/youtube.ts"]);
  });

  it("asks with GET only: no POST, PUT, PATCH or DELETE, no OAuth, no upload, no Authorization header", () => {
    const text = strip(readFileSync(adapter, "utf8"));
    expect(text).toMatch(/method:\s*"GET"/);
    expect(text).not.toMatch(/method:\s*"(?!GET")/);
    expect(text).not.toMatch(/\b(?:POST|PUT|PATCH|DELETE)\b|oauth|Authorization|upload|FormData|JSON\.stringify\(/i);
  });

  it("reads through the byte-counting reader and refuses redirects", () => {
    const text = strip(readFileSync(adapter, "utf8"));
    expect(text).toMatch(/readCapped\(/);
    expect(text).toMatch(/redirect:\s*"error"/);
  });
});
