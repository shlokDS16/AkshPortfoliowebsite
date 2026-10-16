import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The wording rules for every word the letters screens show (plan constraint: plain words; never "proof", "verified", "buy", "sell",
// "weekly"; no emoji, no dash used as a pause). Reads the source of the screens, their components and the sentence-making modules.

const SRC = resolve(__dirname, "../../../..");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const FILES = [
  ...sources(__dirname),
  ...sources(resolve(SRC, "app/desk/letters")),
  ...["status", "checks", "monday", "subject", "desk-read", "screen"].map((n) => resolve(SRC, `modules/distribution/letters/${n}.ts`)),
];

describe("the words on the letters screens", () => {
  it("reads the files it is supposed to", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES.some((f) => f.endsWith("send-block.tsx"))).toBe(true);
    expect(FILES.some((f) => f.endsWith("readers/page.tsx") || f.endsWith("readers\\page.tsx"))).toBe(true);
  });

  it("uses none of the banned words, no emoji and no dash used as a pause", () => {
    for (const file of FILES) {
      const code = strip(readFileSync(file, "utf8"));
      expect(code, file).not.toMatch(/\b(?:proof|verified|buy|sell|weekly)\b/i);
      expect(code, file).not.toMatch(/\p{Extended_Pictographic}|—|–/u);
    }
  });
});
