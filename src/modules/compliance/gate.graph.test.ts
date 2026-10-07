import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-003: the secret-key client reaches the gate functions from exactly one file, only the server-only gate service
// imports it, and only the compliance actions (which call requireAdmin() first) import that. ESLint enforces the first.
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

  it("only compliance/gate-service.ts imports gate-rpc, and only compliance/actions.ts imports gate-service", () => {
    expect(importers(/from\s+"(\.\/gate-rpc|@\/modules\/compliance\/gate-rpc)"/)).toEqual(["modules/compliance/gate-service.ts"]);
    expect(importers(/from\s+"(\.\/gate-service|@\/modules\/compliance\/gate-service)"/)).toEqual(["modules/compliance/actions.ts"]);
  });

  it("M1: gate-service is server-only, so publishRevision (which takes a caller-supplied hand check) is not a server action", () => {
    expect(readFileSync(resolve(__dirname, "gate-service.ts"), "utf8")).toMatch(/^import "server-only";/);
  });

  it("gate-rpc is server-only and is not re-exported from the compliance index", () => {
    expect(readFileSync(resolve(__dirname, "gate-rpc.ts"), "utf8")).toMatch(/^import "server-only";/);
    expect(readFileSync(resolve(__dirname, "index.ts"), "utf8")).not.toMatch(/gate-rpc/);
  });
});
