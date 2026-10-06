export type Company = { id: string; slug: string; name: string; nseSymbol: string | null; needsReview: boolean };
export type Theme = { id: string; slug: string; name: string; needsReview: boolean };

export interface CatalogRepo {
  findCompanyBySymbol(symbol: string): Promise<Company | null>;
  insertCompany(row: { slug: string; name: string; nseSymbol: string; needsReview: boolean }): Promise<Company>;
  findThemeBySlug(slug: string): Promise<Theme | null>;
  insertTheme(row: { slug: string; name: string; needsReview: boolean }): Promise<Theme>;
}
