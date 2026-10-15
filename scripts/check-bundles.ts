// The bundle check of Plan 2.7 Task 3 (spec s7.4, D18). Run after `pnpm build`, in CI and by hand (Node 22.18+ strips the types):
//
//   node scripts/check-bundles.ts
//
// 1. The client chunks of every route except /desk/models/[versionId] contain neither IronCalc (`ironcalc`, `wasm_bg`) nor SheetJS.
//    A route's chunks are its entry chunks and its client modules' chunks (from its client reference manifest), and every chunk those
//    load in turn (a lazy import or a Web Worker names its chunk as a string), followed to the end.
// 2. The model page does reach the engine, in a .js chunk with the wasm glue (otherwise the check above proves nothing).
// 3. No file the browser can download (.next/static) contains @ironcalc/nodejs, a .node binary or SheetJS, and no client manifest names
//    the xlsx or @ironcalc/nodejs packages.
// 4. public/vendor/ironcalc-0.8.4.wasm exists and is byte-for-byte the package's wasm_bg.wasm.
// Exits 1 with every failure listed, 0 when all hold.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const next = join(root, ".next");
const staticDir = join(next, "static");
const MODEL_ROUTE = "/desk/models/[versionId]/page";
const ENGINE = [/ironcalc/i, /wasm_bg/];
// What only the real worker chunk holds: the wasm-bindgen glue and the engine's own method. Turbopack also copies the worker's source
// (.ts, with comments that say "IronCalc") into static/media; that copy must not satisfy the control in step 2.
const GLUE = [/__wbindgen_/, /getFormattedCellValue/];
const SHEETJS = /SheetJS/;
const CHUNK_REF = /static\/(?:chunks|media)\/[A-Za-z0-9_.-]+\.(?:js|ts|wasm)/g;

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const text = new Map<string, string>();
const read = (rel: string): string => {
  if (!text.has(rel)) {
    const path = join(next, rel);
    text.set(rel, existsSync(path) ? readFileSync(path, "latin1") : "");
  }
  return text.get(rel)!;
};
const norm = (chunk: string) => chunk.replace(/^\/?_next\//, "").replace(/^\//, "");

/** The route's chunks and everything they load, transitively. */
function reachable(manifest: { entryJSFiles?: Record<string, string[]>; clientModules?: Record<string, { chunks: string[] }> }, route: string): Set<string> {
  const start = new Set<string>();
  for (const [entry, chunks] of Object.entries(manifest.entryJSFiles ?? {})) if (entry.endsWith(route.replace(/^\//, "")) || entry.includes("/layout") || entry.includes("global-error")) for (const c of chunks) start.add(norm(c));
  for (const mod of Object.values(manifest.clientModules ?? {})) for (const c of mod.chunks) start.add(norm(c));
  const seen = new Set<string>();
  const todo = [...start];
  while (todo.length > 0) {
    const chunk = todo.pop()!;
    if (seen.has(chunk)) continue;
    seen.add(chunk);
    if (!chunk.endsWith(".js") && !chunk.endsWith(".ts")) continue;
    for (const ref of read(chunk).match(CHUNK_REF) ?? []) if (!seen.has(ref)) todo.push(ref);
  }
  return seen;
}

function manifests(): { route: string; manifest: Parameters<typeof reachable>[0] }[] {
  return walk(join(next, "server", "app"))
    .filter((f) => f.endsWith("_client-reference-manifest.js"))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...source.matchAll(/globalThis\.__RSC_MANIFEST\["([^"]+)"\]\s*=\s*(\{[\s\S]*?\});?\s*(?=globalThis\.__RSC_MANIFEST\[|$)/g)].map((m) => ({ route: m[1], manifest: JSON.parse(m[2]) }));
    });
}

if (!existsSync(staticDir)) {
  console.error("No .next/static: run `pnpm build` first.");
  process.exit(1);
}

// 1 and 2: per route.
const routes = manifests();
if (routes.length === 0) fail("no client reference manifest found under .next/server/app");
if (!routes.some((r) => r.route === MODEL_ROUTE)) fail(`no client reference manifest for ${MODEL_ROUTE}`);
for (const { route, manifest } of routes) {
  const chunks = reachable(manifest, route);
  const engineIn = [...chunks].filter((c) => ENGINE.some((p) => p.test(c) || p.test(read(c))));
  if (route === MODEL_ROUTE) {
    const glueIn = [...chunks].filter((c) => c.endsWith(".js") && GLUE.every((p) => p.test(read(c))));
    if (glueIn.length === 0) fail(`${route} reaches no chunk with the engine: the check cannot see the worker`);
  } else if (engineIn.length > 0) fail(`${route} loads IronCalc: ${engineIn.join(", ")}`);
  const sheet = [...chunks].filter((c) => SHEETJS.test(read(c)));
  if (sheet.length > 0) fail(`${route} loads SheetJS: ${sheet.join(", ")}`);
  for (const key of Object.keys(manifest.clientModules ?? {})) {
    if (/node_modules[\\/](?:\.pnpm[\\/])?(?:xlsx@|xlsx[\\/])/.test(key)) fail(`${route} has the xlsx package as a client module`);
    if (/@ironcalc[+/]nodejs/.test(key)) fail(`${route} has @ironcalc/nodejs as a client module`);
  }
}

// 3: everything the browser can download.
for (const file of walk(staticDir)) {
  const rel = relative(next, file).split(sep).join("/");
  if (file.endsWith(".node")) fail(`a native binary is served: ${rel}`);
  if (!/\.(?:js|ts|mjs|cjs|css|json)$/.test(file)) continue;
  const body = read(rel);
  if (body.includes("@ironcalc/nodejs") || body.includes("@ironcalc+nodejs")) fail(`${rel} names @ironcalc/nodejs`);
  if (SHEETJS.test(body)) fail(`${rel} contains SheetJS`);
}

// 4: the served wasm is the package's.
const served = join(root, "public", "vendor", "ironcalc-0.8.4.wasm");
const shipped = join(root, "node_modules", "@ironcalc", "wasm", "wasm_bg.wasm");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
if (!existsSync(served)) fail("public/vendor/ironcalc-0.8.4.wasm is missing (pnpm install runs scripts/copy-ironcalc-wasm.mjs)");
else if (!existsSync(shipped)) fail("node_modules/@ironcalc/wasm/wasm_bg.wasm is missing");
else if (sha(served) !== sha(shipped)) fail("public/vendor/ironcalc-0.8.4.wasm differs from the package's wasm_bg.wasm");

if (failures.length > 0) {
  console.error(`Bundle check failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Bundle check passed: ${routes.length} routes; IronCalc only on ${MODEL_ROUTE}; no SheetJS, no @ironcalc/nodejs, no .node in the browser; the served wasm matches the package.`);
