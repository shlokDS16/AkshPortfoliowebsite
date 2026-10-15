// A1 addresses and cell keys. Browser-safe, no imports.

const ADDR = /^([A-Z]{1,3})([0-9]{1,7})$/;
export const MAX_COL = 16_384;
export const MAX_ROW = 1_048_576;

export function colToLetters(col: number): string {
  let out = "";
  for (let c = col; c > 0; c = Math.floor((c - 1) / 26)) out = String.fromCharCode(65 + ((c - 1) % 26)) + out;
  return out;
}

export function lettersToCol(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return col;
}

/** "B12" -> { row: 12, col: 2 } (both 1-based, as the engines take them); null when it is not a cell address in range. */
export function parseAddr(addr: string): { row: number; col: number } | null {
  const m = ADDR.exec(addr);
  if (!m) return null;
  const col = lettersToCol(m[1]);
  const row = Number(m[2]);
  if (col < 1 || col > MAX_COL || row < 1 || row > MAX_ROW) return null;
  return { row, col };
}

export const formatAddr = (row: number, col: number): string => `${colToLetters(col)}${row}`;

/** The key of one cell in every table of the module: the sheet name, "!", the address. Sheet names may contain "!", addresses never do. */
export const cellKey = (sheet: string, addr: string): string => `${sheet}!${addr}`;

export function splitKey(key: string): { sheet: string; addr: string } {
  const at = key.lastIndexOf("!");
  return { sheet: key.slice(0, at), addr: key.slice(at + 1) };
}
