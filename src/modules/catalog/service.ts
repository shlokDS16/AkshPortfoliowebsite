import { slugify } from "@/lib/slug";
import { isUniqueViolation } from "@/lib/supabase/errors";
import type { CatalogRepo, Company, Theme } from "./types";

export class InvalidCatalogTokenError extends Error {
  constructor(token: string) {
    super(`"${token}" is not a usable symbol or theme`);
    this.name = "InvalidCatalogTokenError";
  }
}

/** How one kind of stub is normalised, found and created; `ensureStub` does the rest. */
type StubKind<T> = {
  /** The lookup key for a raw token; throws InvalidCatalogTokenError when nothing is usable. */
  key(token: string): string;
  find(repo: CatalogRepo, key: string): Promise<T | null>;
  /** Inserts the stub, always flagged needs_review (spec s5). */
  insert(repo: CatalogRepo, key: string): Promise<T>;
};

/**
 * Find-or-create. A unique violation means a concurrent capture created the same stub between our
 * find and insert, so the existing row is returned. A violation with no row behind it (for example a
 * slug clash with a different symbol) is a real error and is rethrown.
 */
async function ensureStub<T>(kind: StubKind<T>, repo: CatalogRepo, token: string): Promise<T> {
  const key = kind.key(token);
  const existing = await kind.find(repo, key);
  if (existing) return existing;
  try {
    return await kind.insert(repo, key);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await kind.find(repo, key);
    if (raced) return raced;
    throw error;
  }
}

// NSE symbols may start with a digit (5PAISA, 360ONE) but must contain a letter, like the capture parser.
const NSE_SYMBOL = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9&-]{0,19}$/;

const companyKind: StubKind<Company> = {
  key(token) {
    const symbol = token.trim().toUpperCase();
    if (!NSE_SYMBOL.test(symbol)) throw new InvalidCatalogTokenError(token);
    return symbol;
  },
  find: (repo, symbol) => repo.findCompanyBySymbol(symbol),
  insert: (repo, symbol) =>
    repo.insertCompany({ slug: slugify(symbol), name: symbol, nseSymbol: symbol, needsReview: true }),
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const themeKind: StubKind<Theme> = {
  key(token) {
    const slug = slugify(token);
    if (!slug) throw new InvalidCatalogTokenError(token);
    return slug;
  },
  find: (repo, slug) => repo.findThemeBySlug(slug),
  insert: (repo, slug) => repo.insertTheme({ slug, name: titleCase(slug), needsReview: true }),
};

/** Finds a company by NSE symbol or creates a private stub flagged for review (spec s5). */
export const ensureCompany = (repo: CatalogRepo, symbol: string): Promise<Company> =>
  ensureStub(companyKind, repo, symbol);

/** Finds a theme by slug or creates a private stub flagged for review (spec s5). */
export const ensureTheme = (repo: CatalogRepo, token: string): Promise<Theme> => ensureStub(themeKind, repo, token);
