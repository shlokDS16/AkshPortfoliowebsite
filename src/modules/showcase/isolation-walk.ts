import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to this file (src/modules/showcase), not the working directory.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// import/export ... from "x", bare import "x", dynamic import("x") and require("x").
export const FROM = /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;

/** The generated database types name every table; they hold no query, so they are not read for this rule. */
export const GENERATED = /database\.types\.ts$/;

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(existsSync) ?? null;
}

/** Every first-party file reachable from `entry` through import and re-export statements. */
export function closure(entry: string): Map<string, string> {
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

export function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

