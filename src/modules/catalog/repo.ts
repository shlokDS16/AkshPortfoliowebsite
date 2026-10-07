import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { CatalogRepo, Company, Theme } from "./types";

const COMPANY_COLUMNS = "id, slug, name, nse_symbol, needs_review";
const THEME_COLUMNS = "id, slug, name, needs_review";

type CompanyRow = { id: string; slug: string; name: string; nse_symbol: string | null; needs_review: boolean };
type ThemeRow = { id: string; slug: string; name: string; needs_review: boolean };

const toCompany = (r: CompanyRow): Company => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  nseSymbol: r.nse_symbol,
  needsReview: r.needs_review,
});
const toTheme = (r: ThemeRow): Theme => ({ id: r.id, slug: r.slug, name: r.name, needsReview: r.needs_review });

export function createSupabaseCatalogRepo(db: Db): CatalogRepo {
  return {
    async findCompanyBySymbol(symbol) {
      const { data, error } = await db.from("companies").select(COMPANY_COLUMNS).eq("nse_symbol", symbol).maybeSingle();
      if (error) throw dbError("catalog.findCompanyBySymbol", error);
      return data ? toCompany(data) : null;
    },
    async findCompanyByAlias(symbol) {
      const { data, error } = await db.from("company_aliases").select(`company:companies(${COMPANY_COLUMNS})`).eq("symbol", symbol).maybeSingle();
      if (error) throw dbError("catalog.findCompanyByAlias", error);
      return data?.company ? toCompany(data.company) : null;
    },
    async isIgnored(kind, token) {
      const { data, error } = await db.from("ignored_tokens").select("token").eq("kind", kind).eq("token", token).maybeSingle();
      if (error) throw dbError("catalog.isIgnored", error);
      return data !== null;
    },
    async insertCompany(row) {
      const { data, error } = await db
        .from("companies")
        .insert({ slug: row.slug, name: row.name, nse_symbol: row.nseSymbol, needs_review: row.needsReview })
        .select(COMPANY_COLUMNS)
        .single();
      if (error) throw dbError("catalog.insertCompany", error);
      return toCompany(data);
    },
    async findThemeBySlug(slug) {
      const { data, error } = await db.from("themes").select(THEME_COLUMNS).eq("slug", slug).maybeSingle();
      if (error) throw dbError("catalog.findThemeBySlug", error);
      return data ? toTheme(data) : null;
    },
    async insertTheme(row) {
      const { data, error } = await db
        .from("themes")
        .insert({ slug: row.slug, name: row.name, needs_review: row.needsReview })
        .select(THEME_COLUMNS)
        .single();
      if (error) throw dbError("catalog.insertTheme", error);
      return toTheme(data);
    },
  };
}
