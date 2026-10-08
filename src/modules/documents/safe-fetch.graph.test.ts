import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// The link fetch is the only place the server requests an address Aksh typed (Plan 2b Task 5, ruling R10). This keeps it so:
// no other file under src/ reaches the network by node:http(s), DNS or sockets, and no module calls fetch() at all (the adapters
// in src/lib/providers call fixed Groq and OCR.space addresses and are outside src/modules).
const SRC = resolve(__dirname, "../..");
const ALLOWED = new Set(["modules/documents/safe-fetch-transport.ts"]);
const NETWORK = [/from\s+"node:(https?|dns|dns\/promises|net|tls|dgram)"/, /require\(\s*"(?:node:)?(?:https?|dns|net|tls)"\s*\)/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const rel = (file: string) => relative(SRC, file).split(sep).join("/");
const source = (file: string) => readFileSync(file, "utf8");

describe("safe-fetch is the one door to a user-supplied address", () => {
  const all = files(SRC);

  it("no file outside the transport imports node:http(s), dns, net or tls, except safe-fetch's own address check", () => {
    const offenders = all.filter((f) => !ALLOWED.has(rel(f)) && rel(f) !== "modules/documents/safe-fetch.ts" && NETWORK.some((p) => p.test(source(f)))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("safe-fetch.ts uses node:net only to tell an address from a name", () => {
    const text = source(join(SRC, "modules/documents/safe-fetch.ts"));
    expect(text).toMatch(/from "node:net"/);
    expect(text).not.toMatch(/node:(https?|dns|tls)/);
    expect(text).not.toMatch(/\bfetch\(/);
  });

  it("no module calls fetch()", () => {
    const offenders = all.filter((f) => rel(f).startsWith("modules/") && /(^|[^.\w])fetch\(/.test(source(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the transport sends no cookie or authorization header and never switches certificate checks off", () => {
    const text = source(join(SRC, "modules/documents/safe-fetch-transport.ts")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(text).not.toMatch(/cookie|authorization|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/i);
  });

  it("the guard is not bypassed: only safe-fetch.ts names the real resolver and transport", () => {
    const users = all.filter((f) => /\b(httpsTransport|systemResolver)\b/.test(source(f))).map(rel).sort();
    expect(users).toEqual(["modules/documents/safe-fetch-transport.ts", "modules/documents/safe-fetch.ts"]);
  });
});
