import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F3 (Plan 3b final review): e2e/support/aged-case.sql rewrites the sealed chain. It must refuse to run anywhere but the local
// stack, whatever way it is started, so both guards are the first statements of its block, before anything that writes.

const sql = readFileSync(join(process.cwd(), "e2e", "support", "aged-case.sql"), "utf8");
const block = sql.slice(sql.indexOf("do $fixture$"));
const body = block.slice(block.indexOf("\nbegin") + "\nbegin".length);
const firstWrite = body.search(/\b(?:alter\s+table|update\s|delete\s|insert\s+into|perform\s+public\.|set\s+local\s+role)/i);

describe("the chain-rewriting fixture knows where it runs", () => {
  it("has a writing statement to guard", () => {
    expect(firstWrite).toBeGreaterThan(0);
  });

  it("refuses when its placeholders are not filled, before it writes anything", () => {
    const at = body.indexOf("placeholders not filled");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstWrite);
    expect(body).toMatch(/c_tag\s*!~\s*'\^\[a-z0-9\]\{4,16\}\$'/);
    expect(body).toMatch(/c_mode\s+not in \('case', 'review'\)/);
  });

  it("refuses when admin_email is not the seed's, before it writes anything", () => {
    const at = body.indexOf("admin@desk.test");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstWrite);
    expect(body.slice(0, at)).toMatch(/private\.settings/);
    expect(body).toMatch(/not the local stack/);
  });
});
