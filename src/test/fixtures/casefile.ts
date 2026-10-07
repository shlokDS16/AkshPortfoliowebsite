// Fictional companies for the Phase 1 seed (Plan 1B D20). Every source says "fictional seed data".
export type SeedRevision = { bodyMd: string; sheet: string; reason: string };
export type SeedFile = {
  symbol: string;
  name: string;
  sector: string;
  title: string;
  learningObjective: string;
  holdsPosition: "no";
  revisions: SeedRevision[];
};
export type SeedNote = { kind: "learning" | "process"; title: string; slug: string; learningObjective: string; bodyMd: string; reason: string };

const KAVERI_SHEET_R1 = `O | Fictional maker of farm and municipal water pumps, used to test the desk.
S1 | Annual report 2025-26 (fictional seed data) | Annual report | 2026-07-12
F1 | Revenue from operations | 1284 | ₹ cr | FY26 | 2026-03-31 | S1 | p. 131 | FY25 | 1102 | Revenue from operations rose to ₹1,284 crore.
F2 | Gross margin | 31.4 | % | FY26 | 2026-03-31 | S1 | p. 140 | FY25 | 30.9
F3 | Receivable days | 142 | days | FY26 | 2026-03-31 | S1 | p. 152 | FY25 | 131
T1 | 142 | days | 2026-03-31 | 2026-08-20 | watching | 60 | 200 | 150 | above | 131
T2 | 31.4 | % | 2026-03-31 | 2026-08-20 | not met | 20 | 40 | 28 | below | 30.9
X1 | Receivable days, FY22 to FY26 | days | S1 | T1 | FY22=81 | FY23=95 | FY24=118 | FY25=131 | FY26=142
R | how-to-read-receivable-days`;

const KAVERI_BODY_R1 = `Kaveri ships most of its pumps through about 1,900 dealers. Revenue reached ₹1,284 cr in FY26 [F1], up from ₹1,102 cr a year earlier.

Gross margin held at 31.4% [F2] even as steel costs rose. I read that as some pricing power: dealers kept ordering at list rates.

The part I cannot explain yet is working capital. Receivable days rose to 142 [F3], from 81 four years ago. If dealers are paying later, the margin may rest on longer credit.

## What would prove me wrong
- T1: Receivable days stay above 150 for two straight years.
- T2: Gross margin falls below 28% in a full year.`;

const KAVERI_BODY_R2 = KAVERI_BODY_R1.replace(
  "Receivable days rose to 142 [F3], from 81 four years ago.",
  "Receivable days rose again to 142 [F3], from 81 four years ago, and the order book grew faster than revenue [F4].",
).concat("\n- T3: The dealer count shrinks for two straight years.");

const KAVERI_SHEET_R2 = `${KAVERI_SHEET_R1}
F4 | Order book | 2150 | ₹ cr | FY26 | 2026-03-31 | S1 | p. 18 | FY25 | 1720
SC | Slow | Base | Fast
A | Volume growth | 4% | 8% | 12%
Y | FY28 revenue | ₹ cr | 1,390 | 1,500 | 1,610
Y | FY28 EBITDA margin | % | 12 | 13 | 14`;

export const KAVERI: SeedFile = {
  symbol: "KAVPUMP",
  name: "Kaveri Pumps (fictional)",
  sector: "Capital goods",
  title: "Kaveri Pumps: does pricing power survive slower dealer payments",
  learningObjective: "Learn to read receivable days next to margins when judging pricing power.",
  holdsPosition: "no",
  revisions: [
    { bodyMd: KAVERI_BODY_R1, sheet: KAVERI_SHEET_R1, reason: "First version." },
    { bodyMd: KAVERI_BODY_R2, sheet: KAVERI_SHEET_R2, reason: "Receivable days rose again in FY26; added a test on the dealer count." },
  ],
};

export const SAHYADRI: SeedFile = {
  symbol: "SAHCOLD",
  name: "Sahyadri Cold Chain (fictional)",
  sector: "Transport and logistics",
  title: "Sahyadri Cold Chain: what full warehouses do and do not tell you",
  learningObjective: "Learn why utilisation and rent per pallet must be read together.",
  holdsPosition: "no",
  revisions: [
    {
      reason: "First version.",
      bodyMd: `Sahyadri runs 14 cold-storage warehouses. Utilisation reached 88% in FY26 [F1], the highest in five years.

Full warehouses usually suggest pricing power, but rent per pallet grew only 3% [F2]. I think customers here can switch operators easily, so full space may not turn into higher rents.

## What would prove me wrong
- T1: Rent per pallet grows faster than 8% in a full year.
- T2: Utilisation falls below 75% in a full year.`,
      sheet: `O | Fictional operator of cold-storage warehouses in western India, used to test the desk.
S1 | Annual report 2025-26 (fictional seed data) | Annual report | 2026-07-20
F1 | Warehouse utilisation | 88 | % | FY26 | 2026-03-31 | S1 | p. 44 | FY25 | 84
F2 | Rent per pallet growth | 3 | % | FY26 | 2026-03-31 | S1 | p. 47 | FY25 | 5
T1 | 3 | % | 2026-03-31 | 2026-08-12 | not met | 0 | 15 | 8 | above | 5
T2 | 88 | % | 2026-03-31 | 2026-08-12 | not met | 50 | 100 | 75 | below | 84
X1 | Warehouse utilisation, FY22 to FY26 | % | S1 | T2 | FY22=71 | FY23=76 | FY24=80 | FY25=84 | FY26=88
R | why-utilisation-is-not-pricing-power`,
    },
  ],
};

export const NOTES: SeedNote[] = [
  {
    kind: "learning",
    title: "How to read receivable days",
    slug: "how-to-read-receivable-days",
    learningObjective: "Learn what receivable days measure and why a rising number needs a second look.",
    reason: "First version.",
    bodyMd: `Receivable days estimate how long customers take to pay. Divide trade receivables by revenue and multiply by 365.

A rising number is not bad on its own. A company entering a new region may give longer credit on purpose.

## What to check next to it
- Whether margins moved at the same time.
- Whether the company changed how it books revenue.`,
  },
  {
    kind: "learning",
    title: "Why utilisation is not pricing power",
    slug: "why-utilisation-is-not-pricing-power",
    learningObjective: "Learn to separate demand for capacity from the ability to charge more for it.",
    reason: "First version.",
    bodyMd: `A full warehouse shows demand for space. It does not show that customers would pay more for it.

Check how easily a customer can move to a rival, and whether rents rose when space was short in earlier years.`,
  },
];

export const PROCESS_NOTE: SeedNote = {
  kind: "process",
  title: "How I keep a case file",
  slug: "how-i-keep-a-case-file",
  learningObjective: "Learn the structure every file on this desk follows.",
  reason: "First version.",
  bodyMd: `Each file starts with what I expected and why. Then come the tests that would prove me wrong, written before I know the answer.

Facts sit in their own block with a source for every figure. When something changes I write a new revision with a reason, and the old text stays visible.`,
};
