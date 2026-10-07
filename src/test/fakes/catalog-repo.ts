import { randomUUID } from "node:crypto";
import { DbError } from "@/lib/supabase/errors";
import type { CatalogRepo, Company, Theme } from "@/modules/catalog";

export type MemoryCatalogRepo = CatalogRepo & {
  companies: Map<string, Company>;
  themes: Map<string, Theme>;
  /** Alias symbol to company id. */
  aliases: Map<string, string>;
  /** `${kind}:${token}` entries. */
  ignored: Set<string>;
  /** The next insert of this symbol loses a race: another request inserts it first. */
  simulateRace(symbol: string): void;
  /** The next insert of this theme slug loses a race: another request inserts it first. */
  simulateThemeRace(slug: string): void;
};

const duplicate = (op: string) => new DbError(op, "23505", "duplicate key value violates unique constraint");

export function createMemoryCatalogRepo(): MemoryCatalogRepo {
  const companies = new Map<string, Company>();
  const themes = new Map<string, Theme>();
  const aliases = new Map<string, string>();
  const ignored = new Set<string>();
  let racingSymbol: string | null = null;
  let racingTheme: string | null = null;
  const addCompany = (row: { slug: string; name: string; nseSymbol: string; needsReview: boolean }): Company => {
    const company: Company = { id: randomUUID(), ...row };
    companies.set(company.id, company);
    return company;
  };
  const addTheme = (row: { slug: string; name: string; needsReview: boolean }): Theme => {
    const theme: Theme = { id: randomUUID(), ...row };
    themes.set(theme.id, theme);
    return theme;
  };
  return {
    companies,
    themes,
    aliases,
    ignored,
    simulateRace(symbol) {
      racingSymbol = symbol;
    },
    simulateThemeRace(slug) {
      racingTheme = slug;
    },
    async findCompanyBySymbol(symbol) {
      return [...companies.values()].find((c) => c.nseSymbol === symbol) ?? null;
    },
    async findCompanyByAlias(symbol) {
      const id = aliases.get(symbol);
      return id ? (companies.get(id) ?? null) : null;
    },
    async isIgnored(kind, token) {
      return ignored.has(`${kind}:${token}`);
    },
    async insertCompany(row) {
      if (racingSymbol === row.nseSymbol) {
        racingSymbol = null;
        addCompany(row);
        throw duplicate("catalog.insertCompany");
      }
      if ([...companies.values()].some((c) => c.nseSymbol === row.nseSymbol || c.slug === row.slug)) {
        throw duplicate("catalog.insertCompany");
      }
      return addCompany(row);
    },
    async findThemeBySlug(slug) {
      return [...themes.values()].find((t) => t.slug === slug) ?? null;
    },
    async insertTheme(row) {
      if (racingTheme === row.slug) {
        racingTheme = null;
        addTheme(row);
        throw duplicate("catalog.insertTheme");
      }
      if ([...themes.values()].some((t) => t.slug === row.slug)) throw duplicate("catalog.insertTheme");
      return addTheme(row);
    },
  };
}
