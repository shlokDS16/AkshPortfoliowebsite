import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task 13 adds "src/app/desk" once Plan 1A's plain desk screens are replaced.
const ROOTS = ["src/components", "src/app/(public)"];
const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|from|via|to|shadow|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = ROOTS.flatMap(walk);

describe("tokens are the only source of colour (Plan 1B global constraint)", () => {
  it("scans at least the shared components", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s has no palette classes and no hex colours", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(PALETTE);
    expect(text).not.toMatch(HEX);
  });
});
