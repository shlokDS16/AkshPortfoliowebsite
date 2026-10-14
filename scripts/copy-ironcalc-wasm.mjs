// Copies the IronCalc wasm module out of node_modules into public/vendor/, so the browser can fetch it from our own origin
// (spec 2026-10-14-valuation-2.7-design s3, s4.7). Runs as `postinstall`, so Vercel and CI produce it on every install.
//
// The version is in the file name (ironcalc-0.8.4.wasm), so a new engine version is a new URL and nothing stale is cached. The file is
// the open-source engine, no data. It is not committed (public/vendor/ironcalc-*.wasm is ignored); a unit test checks that the name the
// app uses (versions.ts) is the name this script writes.
//
// Plain .mjs on purpose: a postinstall must run on any Node the project allows (>= 20.9), and type stripping needs 22.18+.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

let packageJson;
try {
  packageJson = require.resolve("@ironcalc/wasm/package.json");
} catch {
  // The package is not installed (a partial install, or a tool that only reads the manifest). Say so and let the install finish.
  console.warn("copy-ironcalc-wasm: @ironcalc/wasm is not installed, nothing to copy");
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(packageJson, "utf8"));
const source = join(dirname(packageJson), "wasm_bg.wasm");
if (!existsSync(source)) {
  console.error(`copy-ironcalc-wasm: ${source} is missing`);
  process.exit(1);
}

const target = join(root, "public", "vendor", `ironcalc-${version}.wasm`);
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copy-ironcalc-wasm: wrote public/vendor/ironcalc-${version}.wasm`);
