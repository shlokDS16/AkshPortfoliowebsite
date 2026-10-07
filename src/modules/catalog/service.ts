import { slugify } from "@/lib/slug";
import { isUniqueViolation } from "@/lib/supabase/errors";
import type { CatalogRepo, Company, Theme } from "./types";

export class InvalidCatalogTokenError extends Error {
  constructor(token: string) {
    super(`"${token}" is not a usable symbol or theme`);
    this.name = "InvalidCatalogTokenError";
  }
}

// NSE symbols may start with a digit (5PAISA, 360ONE) but must contain a letter, like the capture parser.
const NSE_SYMBOL = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9&-]{0,19}$/;

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function companyKey(token: string): string {
  const symbol = token.trim().toUpperCase();
  if (!NSE_SYMBOL.test(symbol)) throw new InvalidCatalogTokenError(token);
  return symbol;
}

function themeKey(token: string): string {
  const slug = slugify(token);
  if (!slug) throw new InvalidCatalogTokenError(token);
  return slug;
}

/** How one kind of stub is normalised, found and created; `ensureStub` does the rest. */
type StubKind<T> = {
  ignoredAs: "symbol" | "theme";
  /** The lookup key for a raw token; throws InvalidCatalogTokenError when nothing is usable. */
  key(token: string): string;
  find(repo: CatalogRepo, key: string): Promise<T | null>;
  /** The slug for the nth insert attempt (1-based), or null when this kind has no fallback. */
  slug(key: string, attempt: number): string | null;
  /** Inserts the stub, always flagged needs_review (spec s5). */
  insert(repo: CatalogRepo, key: string, slug: string): Promise<T>;
};

const MAX_SLUG_ATTEMPTS = 5;

/**
 * Ignored tokens file as plain text (null). Otherwise find (aliases first for companies) or create a stub flagged for
 * review. A unique violation with the row now present is a concurrent capture's stub; one without is a slug clash
 * ($M-AND-M after $M&M), so the next suffixed slug is tried.
 */
async function ensureStub<T>(kind: StubKind<T>, repo: CatalogRepo, token: string): Promise<T | null> {
  const key = kind.key(token);
  if (await repo.isIgnored(kind.ignoredAs, key)) return null;
  const existing = await kind.find(repo, key);
  if (existing) return existing;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = kind.slug(key, attempt);
    if (slug === null) break;
    try {
      return await kind.insert(repo, key, slug);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await kind.find(repo, key);
      if (raced) return raced;
      lastError = error;
    }
  }
  throw lastError ?? new InvalidCatalogTokenError(token);
}

const companyKind: StubKind<Company> = {
  ignoredAs: "symbol",
  key: companyKey,
  find: async (repo, symbol) => (await repo.findCompanyByAlias(symbol)) ?? (await repo.findCompanyBySymbol(symbol)),
  slug: (symbol, attempt) => (attempt === 1 ? slugify(symbol) || "company" : `${slugify(symbol) || "company"}-${attempt}`),
  insert: (repo, symbol, slug) => repo.insertCompany({ slug, name: symbol, nseSymbol: symbol, needsReview: true }),
};

const themeKind: StubKind<Theme> = {
  ignoredAs: "theme",
  key: themeKey,
  find: (repo, slug) => repo.findThemeBySlug(slug),
  slug: (slug, attempt) => (attempt === 1 ? slug : null),
  insert: (repo, slug, s) => repo.insertTheme({ slug: s, name: titleCase(slug), needsReview: true }),
};

/** Finds a company by alias or NSE symbol, or creates a private stub flagged for review; null for an ignored symbol. */
export const ensureCompany = (repo: CatalogRepo, symbol: string): Promise<Company | null> => ensureStub(companyKind, repo, symbol);

/** Finds a theme by slug, or creates a private stub flagged for review; null for an ignored theme. */
export const ensureTheme = (repo: CatalogRepo, token: string): Promise<Theme | null> => ensureStub(themeKind, repo, token);
