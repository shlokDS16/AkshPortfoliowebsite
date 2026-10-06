import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve("src");
const FROM = /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;

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
      const next = resolveSpec(m[1] ?? m[2], file);
      if (next) queue.push(next);
    }
  }
  return seen;
}

describe("rule 10: public code paths use only the cookie-less public client", () => {
  const files = closure(join(ROOT, "modules/showcase/index.ts"));
  const names = [...files.keys()].map((f) => f.slice(ROOT.length + 1).replaceAll("\\", "/"));

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

  it("the cached snapshot reads through createSupabasePublicClient", () => {
    const queries = files.get(join(ROOT, "modules/showcase/queries.ts"))!;
    expect(queries).toContain("createSupabasePublicClient(");
    expect(queries).not.toMatch(/createSupabase(Server|Service|Admin)Client/);
  });
});
