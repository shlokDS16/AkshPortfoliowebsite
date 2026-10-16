import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { POLICY_VERSION, RULE_TITLES } from "./policy";

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

describe("rule labels for the knowledge checks", () => {
  it("names the concept and reading-log checks, and the theme check says concept", () => {
    expect(RULE_TITLES.concept).toBe("Linked concept");
    expect(RULE_TITLES.reading_note).toBe("Reading log");
    expect(RULE_TITLES.theme).toBe("Linked concept");
  });
});

describe("rule 14 (v1.3 addendum, migration 0027)", () => {
  it("is v1.3 and names the outside-sources rule", () => {
    expect(POLICY_VERSION).toBe("sebi-unreg-2026-07-v1.3");
    expect(RULE_TITLES["14"]).toBe("Rule 14: outside sources");
  });
});
