import type { ISODate } from "@/lib/desk-types";
import { formatNumber } from "@/lib/format";

export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "").replace(/−/g, "-");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "₹1,284 cr", "31.4%", "3.2x", "142 days" (design-dna 3.4). */
export function formatFigure(value: number, unit: string): string {
  const v = formatNumber(value);
  if (unit === "₹ cr") return `₹${v} cr`;
  if (unit === "₹") return `₹${v}`;
  if (unit === "%") return `${v}%`;
  if (unit === "x") return `${v}x`;
  return unit ? `${v} ${unit}` : v;
}

/** Indian fiscal periods: FY26 ends 31 Mar 2026; Q1 FY27 ends 30 Jun 2026. */
export function fiscalYearEnd(period: string): ISODate | null {
  const fy = /^FY(\d{2})$/.exec(period);
  if (fy) return `20${fy[1]}-03-31`;
  const q = /^Q([1-4]) FY(\d{2})$/.exec(period);
  if (!q) return null;
  const year = 2000 + Number(q[2]);
  return { "1": `${year - 1}-06-30`, "2": `${year - 1}-09-30`, "3": `${year - 1}-12-31`, "4": `${year}-03-31` }[q[1] as "1" | "2" | "3" | "4"];
}
