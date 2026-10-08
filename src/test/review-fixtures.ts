import type { ProposalView, ReviewData } from "@/modules/ingestion/client";
import { groupValues } from "@/modules/ingestion/client";

export const DOC_ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";

let n = 0;
/** A clean P&L figure from page 4 unless told otherwise. */
export function proposal(over: Partial<ProposalView> = {}): ProposalView {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, page: 4, label: "Revenue from operations", valueText: "1,284.00", unit: "₹ cr", period: "FY26",
    asOf: "2026-03-31", prior: "1,102.00", priorPeriod: "FY25", quote: "Revenue from operations 1,284.00 1,102.00", topic: "P&L", flags: [], why: [],
    status: "pending", reason: "core", basis: "consolidated", machineText: "1,284.00", ...over,
  };
}

export const PAGE_4 = "Consolidated Statement of Profit and Loss\nRevenue from operations 1,284.00 1,102.00\nFinance costs 41.20 38.10\nProfit for the year 212.40 190.10";
export const PAGE_5 = "Consolidated Balance Sheet\nTotal borrowings 512.00 480.00\nCash and cash equivalents 96.00 81.00";

/** The e2e fixture's shape: four clean figures and "Finance costs", misread as 41.70 against 41.20 on the page. */
export function kaveri(over: Partial<ReviewData> = {}): ReviewData {
  const finance = proposal({
    label: "Finance costs", valueText: "41.70", machineText: "41.70", prior: "38.10", quote: "Finance costs 41.70 38.10", flags: ["value_not_on_page"], why: ["The figure 41.70 is not on p. 4."],
  });
  const rows = [
    proposal({ label: "Revenue from operations" }),
    finance,
    proposal({ label: "Profit for the year", valueText: "212.40", machineText: "212.40", prior: "190.10", quote: "Profit for the year 212.40 190.10" }),
    proposal({ label: "Total borrowings", page: 5, topic: "Balance sheet", valueText: "512.00", machineText: "512.00", prior: "480.00", quote: "Total borrowings 512.00 480.00" }),
    proposal({ label: "Cash and cash equivalents", page: 5, topic: "Balance sheet", valueText: "96.00", machineText: "96.00", prior: "81.00", quote: "Cash and cash equivalents 96.00 81.00" }),
  ];
  const { values, hiddenBasis } = groupValues(rows, "consolidated");
  return {
    document: { id: DOC_ID, title: "Annual report 2025-26", companyId: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", companyName: "Kaveri Fixtures", filedOn: null, sourceUrl: null, sourceType: "Annual report", status: "active", originalDeletedAt: null },
    flags: [finance],
    rows,
    values,
    hiddenBasis,
    preferredBasis: "consolidated",
    target: { itemId: "11111111-2222-4333-8444-555555555555", title: "Kaveri file" },
    pageTexts: { 4: PAGE_4, 5: PAGE_5 },
    counts: { pending: 5, accepted: 0, edited: 0, rejected: 0, filed: 0 },
    ...over,
  };
}
