import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

/** Every file reachable from client.ts through relative imports and "@/" aliases (runtime imports only). */
function reachable(entry: string): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    const source = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
    files.set(file, source);
    for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)) {
      const spec = match[1];
      if (spec.startsWith("./") || spec.startsWith("../")) queue.push(resolve(dirname(file), `${spec}.ts`));
      else if (spec.startsWith("@/")) queue.push(resolve(SRC, `${spec.slice(2)}.ts`));
    }
  }
  return files;
}

describe("@/modules/capture/client", () => {
  it("pulls in nothing server-only, so the capture box can bundle it", () => {
    const files = reachable(resolve(__dirname, "client.ts"));
    expect(files.size).toBeGreaterThan(3);
    for (const [file, source] of files) {
      expect(source, file).not.toMatch(/server-only|next\/headers|supabase|"use server"/);
    }
  });
});
