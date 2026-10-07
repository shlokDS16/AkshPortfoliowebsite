// Test-only: the one definition of "a raw Tailwind palette class". Components and screens must use the
// desk tokens (bg-paper, text-ink, ...); tokens-guard.test.ts scans source with it and expectTokenOnly
// (src/test/ui.tsx) checks rendered class lists with it.
export const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|from|via|to|shadow|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;
