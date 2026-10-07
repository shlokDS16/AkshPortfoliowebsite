import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GERU, OG, ON_GERU, PAPER } from "@/lib/theme-colors";
import { DESK_TEXT } from "@/lib/utils";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`missing ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed ${marker}`);
}

function colours(block: string): Map<string, string> {
  const pairs = [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6}|rgb\([^)]*\))/g)];
  return new Map(pairs.map((m) => [m[1], m[2].toUpperCase()]));
}

const light = colours(blockAfter("\n:root {"));
const darkClass = colours(blockAfter("\n.dark {"));
const darkMedia = colours(blockAfter(":root:not(.light) {"));

describe("globals.css tokens", () => {
  it("defines every light colour token in both dark blocks with identical values", () => {
    expect(light.size).toBeGreaterThan(20);
    expect([...darkClass.keys()].sort()).toEqual([...light.keys()].sort());
    expect(darkMedia).toEqual(darkClass);
  });

  it("carries the 2026-10-06 ratification: reading 17/18 px at 1.6, title 21/23 px", () => {
    expect(css).toMatch(/--text-read:\s*1\.0625rem;/);
    expect(css).toMatch(/--text-read--line-height:\s*1\.6;/);
    expect(css).toMatch(/--text-read-desk:\s*1\.125rem;/);
    expect(css).toMatch(/--text-read-desk--line-height:\s*1\.6;/);
    expect(css).toMatch(/--text-title:\s*1\.3125rem;/);
    expect(css).toMatch(/--text-title-desk:\s*1\.4375rem;/);
  });

  it("keeps the motion tokens of design-dna 10.1", () => {
    expect(css).toMatch(/--motion-fast:\s*120ms;/);
    expect(css).toMatch(/--motion-base:\s*180ms;/);
    expect(css).toMatch(/--motion-slow:\s*220ms;/);
    expect(css).toMatch(/--ease-snap:\s*cubic-bezier\(0\.2, 0, 0, 1\);/);
  });

  it("emits every theme variable and keeps keyframes outside @theme so they always ship", () => {
    expect(css).toContain("@theme static {");
    expect(blockAfter("@theme static {")).not.toContain("@keyframes");
    for (const name of ["tick-in", "ink-in", "draw", "fade", "hairline", "toast-in"]) expect(css).toContain(`@keyframes ${name} {`);
  });

  it("honours reduced motion in CSS and for view transitions, and keeps the reader's hairline", () => {
    const reduce = blockAfter("@media (prefers-reduced-motion: reduce)");
    expect(reduce).toContain("::view-transition-group(*)");
    expect(reduce).toContain("animation-duration: 0.01ms !important");
    expect(reduce).toMatch(/\.progress-hairline\s*\{\s*animation-duration:\s*auto !important;/);
  });

  it("mirrors the colours that CSS variables cannot reach (theme-color, next/og, favicon)", () => {
    expect(PAPER).toEqual({ light: light.get("paper"), dark: darkClass.get("paper") });
    expect(GERU).toEqual({ light: light.get("geru"), dark: darkClass.get("geru") });
    expect(ON_GERU).toEqual({ light: light.get("on-geru"), dark: darkClass.get("on-geru") });
    expect(OG).toEqual({
      paper: light.get("paper"),
      surface: light.get("surface"),
      ruleStrong: light.get("rule-strong"),
      inkMuted: light.get("ink-muted"),
      inkBody: light.get("ink-body"),
      ink: light.get("ink"),
      geru: light.get("geru"),
      onGeru: light.get("on-geru"),
    });
  });

  it("keeps cn's DESK_TEXT list equal to the --text-* font-size tokens", () => {
    const tokens = [...blockAfter("@theme static {").matchAll(/--text-([a-z0-9]+(?:-[a-z0-9]+)*):/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(20);
    expect([...DESK_TEXT].sort()).toEqual([...new Set(tokens)].sort());
  });
});
