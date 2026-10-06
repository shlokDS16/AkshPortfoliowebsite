import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { POLICY_VERSION } from "./policy";

const MIGRATIONS = resolve(__dirname, "../../../supabase/migrations");

describe("the policy version is pinned identically in TypeScript and SQL (ADR-003)", () => {
  it("POLICY_VERSION equals c_policy in the newest migration that defines publish_revision", () => {
    const defining = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(resolve(MIGRATIONS, name), "utf8"))
      .filter((sql) => /create\s+(or\s+replace\s+)?function\s+public\.publish_revision\s*\(/i.test(sql));
    const latest = defining.at(-1) ?? "";
    const pinned = /c_policy\s+constant\s+text\s*:=\s*'([^']+)'/.exec(latest)?.[1];
    expect(pinned).toBe(POLICY_VERSION);
  });
});
