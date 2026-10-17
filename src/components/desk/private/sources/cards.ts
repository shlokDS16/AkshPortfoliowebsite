import type { AttachableCompany, AttachableConcept } from "@/modules/catalog";
import type { SourceRecord } from "@/modules/sources/client";
import type { AttachOption } from "./attach-picker";
import type { CardModel } from "./source-card";

// The sources page's view model: ids become names and titles, so the card components hold no id lookups. Pure.

export const companyOptions = (companies: readonly AttachableCompany[]): AttachOption[] => companies.map((c) => ({ id: c.id, label: c.name, hint: c.symbol }));
export const conceptOptions = (concepts: readonly AttachableConcept[]): AttachOption[] => concepts.map((c) => ({ id: c.id, label: c.name, hint: null }));

type Input = {
  records: readonly SourceRecord[];
  companies: readonly AttachableCompany[];
  concepts: readonly AttachableConcept[];
  /** Link id to the ids of the public files whose current revision lists it. */
  publicLinks: ReadonlyMap<string, readonly string[]>;
  itemTitles: ReadonlyMap<string, string>;
};

export function buildCards({ records, companies, concepts, publicLinks, itemTitles }: Input): CardModel[] {
  const company = new Map(companies.map((c) => [c.id, c]));
  const concept = new Map(concepts.map((c) => [c.id, c]));
  return records.map((record) => ({
    record,
    companies: record.companyIds.flatMap((id) => {
      const c = company.get(id);
      return c ? [{ id: c.id, label: c.name, hint: c.symbol, slug: c.slug }] : [];
    }),
    concepts: record.themeIds.flatMap((id) => {
      const c = concept.get(id);
      return c ? [{ id: c.id, label: c.name, hint: null, slug: c.slug }] : [];
    }),
    publicFiles: [...new Set(publicLinks.get(record.id) ?? [])].map((itemId) => ({ itemId, title: itemTitles.get(itemId) ?? "the public file" })),
  }));
}

export type FilterQuery = { company?: string; concept?: string; public?: string; archived?: string };

/** The page's address as the list asks for it (ids), and as the form shows it (slugs). A slug that names nothing is ignored. */
export function readFilters(query: FilterQuery, companies: readonly AttachableCompany[], concepts: readonly AttachableConcept[]) {
  const company = companies.find((c) => c.slug === query.company);
  const concept = concepts.find((c) => c.slug === query.concept);
  const onPublic = query.public === "1";
  const includeArchived = query.archived === "1";
  return {
    companyId: company?.id,
    themeId: concept?.id,
    onPublic,
    includeArchived,
    selected: { company: company?.slug, concept: concept?.slug, onPublic, archived: includeArchived },
  };
}
