import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const kb = (file: string) => statSync(new URL(`./${file}`, import.meta.url)).size / 1024;
const SANS = ["plex-sans-400.woff2", "plex-sans-500.woff2", "plex-sans-600.woff2"];
const MONO = ["plex-mono-400.woff2", "plex-mono-500.woff2"];

describe("font budget (design-dna 3.5 and 16)", () => {
  it("keeps the preloaded Sans files within 50 kB", () => {
    expect(SANS.reduce((sum, f) => sum + kb(f), 0)).toBeLessThanOrEqual(50);
  });

  it("keeps the whole font payload within 110 kB", () => {
    expect([...SANS, ...MONO].reduce((sum, f) => sum + kb(f), 0)).toBeLessThanOrEqual(110);
  });
});
