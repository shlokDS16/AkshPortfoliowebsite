// Mirrors src/app/globals.css (src/app/globals.test.ts keeps them equal). Use only where CSS
// variables cannot reach: <meta name="theme-color">, next/og share cards, the SVG favicon.
export const PAPER = { light: "#F7F2E8", dark: "#17140F" } as const;
export const GERU = { light: "#A13A22", dark: "#E8907A" } as const;
export const ON_GERU = { light: "#FFFFFF", dark: "#1B0F0B" } as const;
export const OG = {
  paper: "#F7F2E8",
  surface: "#EEE7D8",
  ruleStrong: "#C6B9A2",
  inkMuted: "#62594D",
  inkBody: "#2B251E",
  ink: "#1F1A14",
  geru: "#A13A22",
  onGeru: "#FFFFFF",
} as const;
