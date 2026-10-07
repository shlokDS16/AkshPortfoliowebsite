import type { DiffLine } from "./types";

const MAX_CELLS = 4_000_000; // keeps the LCS table well under 50 MB

function toLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/** Line diff (longest common subsequence) between two revision bodies. */
export function diffRevisions(older: string, newer: string): DiffLine[] {
  const a = toLines(older);
  const b = toLines(newer);
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ op: "remove", text })),
      ...b.map((text): DiffLine => ({ op: "add", text })),
    ];
  }
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "remove", text: a[i] });
      i++;
    } else {
      out.push({ op: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "remove", text: a[i++] });
  while (j < m) out.push({ op: "add", text: b[j++] });
  return out;
}
