import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GERU, ON_GERU } from "@/lib/theme-colors";

describe("favicon (segment 5)", () => {
  const svg = readFileSync(new URL("./icon1.svg", import.meta.url), "utf8");

  it("is the AA tag mark with outlined letters and a dark-scheme rule in the token colours", () => {
    expect(svg).toContain('d="M2 2H23L30 9V30H2Z"');
    expect(svg).not.toContain("<text");
    expect(svg).toContain("@media (prefers-color-scheme: dark)");
    for (const colour of [GERU.light, ON_GERU.light, GERU.dark, ON_GERU.dark]) expect(svg).toContain(colour);
  });

  it("ships the 32 px and 16 px PNG fallbacks", () => {
    expect(statSync(new URL("./icon2.png", import.meta.url)).size).toBeGreaterThan(100);
    expect(statSync(new URL("./icon3.png", import.meta.url)).size).toBeGreaterThan(80);
  });
});
