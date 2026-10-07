export type Company = { id: string; slug: string; name: string; nseSymbol: string | null; needsReview: boolean };
export type Theme = { id: string; slug: string; name: string; needsReview: boolean };

export interface CatalogRepo {
  findCompanyBySymbol(symbol: string): Promise<Company | null>;
  /** The company a decided "Same as" alias points at (migration 0005), or null. */
  findCompanyByAlias(symbol: string): Promise<Company | null>;
  /** True once the admin said this token is not a company/theme ("Not a company, keep as text"). */
  isIgnored(kind: "symbol" | "theme", token: string): Promise<boolean>;
  insertCompany(row: { slug: string; name: string; nseSymbol: string; needsReview: boolean }): Promise<Company>;
  findThemeBySlug(slug: string): Promise<Theme | null>;
  insertTheme(row: { slug: string; name: string; needsReview: boolean }): Promise<Theme>;
}
