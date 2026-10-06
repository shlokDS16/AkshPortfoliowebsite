import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-003: the secret-key client reaches the gate functions from exactly one file, and only the compliance
// actions (which call requireAdmin() first) import that file. ESLint enforces the first; this proves both.
const SRC = resolve(__dirname, "../..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const importers = (pattern: RegExp) =>
  files(SRC)
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(SRC, file).split(sep).join("/"))
    .sort();

describe("gate-rpc confinement", () => {
  it("outside job code, only compliance/gate-rpc.ts imports the secret-key client", () => {
    const users = importers(/from\s+"@\/lib\/supabase\/service"/).filter((file) => !file.startsWith("modules/ops/"));
    expect(users).toEqual(["modules/compliance/gate-rpc.ts"]);
  });

  it("only compliance/actions.ts imports gate-rpc", () => {
    expect(importers(/from\s+"(\.\/gate-rpc|@\/modules\/compliance\/gate-rpc)"/)).toEqual(["modules/compliance/actions.ts"]);
  });

  it("gate-rpc is server-only and is not re-exported from the compliance index", () => {
    expect(readFileSync(resolve(__dirname, "gate-rpc.ts"), "utf8")).toMatch(/^import "server-only";/);
    expect(readFileSync(resolve(__dirname, "index.ts"), "utf8")).not.toMatch(/gate-rpc/);
  });
});
