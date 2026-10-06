import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

/** Every file reachable from an entry through relative imports and "@/" aliases (runtime imports only). */
function reachable(entry: string): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    files.set(file, source);
    for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)) {
      const spec = match[1];
      if (spec.startsWith("./") || spec.startsWith("../")) queue.push(resolve(dirname(file), `${spec}.ts`));
      else if (spec.startsWith("@/")) queue.push(resolve(SRC, `${spec.slice(2)}.ts`));
    }
  }
  return files;
}

const SERVICE = resolve(SRC, "lib/supabase/service.ts");
const SERVER_ENV = resolve(SRC, "lib/env.server.ts");

describe("the public /api/health import graph (controller ruling R6)", () => {
  for (const [label, entry] of [
    ["app/api/health/route.ts", resolve(SRC, "app/api/health/route.ts")],
    ["@/modules/ops/health", resolve(__dirname, "health.ts")],
    ["@/modules/ops (index)", resolve(__dirname, "index.ts")],
  ] as const) {
    it(`${label} cannot reach the secret-key client or the server secrets`, () => {
      const files = reachable(entry);
      expect(files.size).toBeGreaterThan(1);
      const paths = [...files.keys()];
      expect(paths).not.toContain(SERVICE);
      expect(paths).not.toContain(SERVER_ENV);
      for (const [file, source] of files) {
        expect(source, file).not.toMatch(/supabase\/service|env\.server|SUPABASE_SECRET_KEY|CRON_SECRET|ops\/jobs|job-deps/);
      }
    });
  }

  it("the browser-safe index reaches no node:crypto, so a client bundle can import it", () => {
    for (const [file, source] of reachable(resolve(__dirname, "index.ts"))) {
      expect(source, file).not.toMatch(/node:crypto|from "crypto"/);
    }
  });

  it("the job routes do reach the secret-key client (so this test can tell the difference)", () => {
    const files = reachable(resolve(SRC, "app/api/jobs/run/route.ts"));
    expect([...files.keys()]).toContain(SERVICE);
  });
});
