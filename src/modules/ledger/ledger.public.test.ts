import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Nothing about the ledger is reachable from a public route, the public snapshot or the public components (Plan 3a Task 10):
// no file there imports the ledger module or its screens' components. The private screens live under /desk only.
const SRC = resolve(__dirname, "../..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const LEDGER = /@\/modules\/ledger|components\/desk\/private\/ledger|messages-ledger/;

describe("the ledger stays private", () => {
  const publicPlaces = ["app/(public)", "modules/showcase", "components/desk/chart"];
  for (const place of publicPlaces) {
    it(`${place} imports nothing from the ledger`, () => {
      const files = filesUnder(join(SRC, place));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(LEDGER);
    });
  }

  it("the public snapshot and the health route name no ledger table", () => {
    for (const file of [...filesUnder(join(SRC, "modules/showcase")), ...filesUnder(join(SRC, "app/api"))]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/idea_events|idea_scores|"ideas"|ledger_anchors|prices_daily/);
    }
  });

  it("the Ledger pages are under /desk, where the layout checks the admin", () => {
    const pages = filesUnder(join(SRC, "app")).filter((f) => LEDGER.test(readFileSync(f, "utf8")) && /page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(page.replaceAll("\\", "/"), page).toContain("/app/desk/");
  });
});
