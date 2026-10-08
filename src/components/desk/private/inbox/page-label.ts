import type { PageKind } from "@/modules/documents/client";

const KIND: Record<PageKind, string> = {
  pl: "P&L",
  bs: "Balance sheet",
  cf: "Cash flow",
  notes: "Notes",
  segment: "Segments",
  mdna: "Management discussion",
  other: "Other",
};

/** "P&L · consolidated": what the page is, and on which basis the document prints it. A scan not yet read says so. */
export function pageLabel(page: { kind: PageKind | null; basis: string | null; scan?: boolean }): string {
  if (page.scan && !page.kind) return "Scanned page, not read yet";
  const kind = page.kind ? KIND[page.kind] : "Not a statement page";
  return page.basis ? `${kind} · ${page.basis}` : kind;
}
