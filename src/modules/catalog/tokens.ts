import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

export type KnownTokenLists = { symbols: string[]; themes: string[]; ignoredSymbols: string[]; ignoredThemes: string[] };

/** Screened, non-archived companies and themes plus aliases are known; ignored tokens colour as plain text. */
export async function listKnownTokens(db: Db): Promise<KnownTokenLists> {
  const [companies, aliases, themes, ignored] = await Promise.all([
    db.from("companies").select("nse_symbol").eq("needs_review", false).is("archived_at", null).not("nse_symbol", "is", null),
    db.from("company_aliases").select("symbol"),
    db.from("themes").select("slug").eq("needs_review", false).is("archived_at", null),
    db.from("ignored_tokens").select("kind, token"),
  ]);
  for (const r of [companies, aliases, themes, ignored]) if (r.error) throw dbError("catalog.knownTokens", r.error);
  return {
    symbols: [...(companies.data ?? []).flatMap((c) => (c.nse_symbol ? [c.nse_symbol] : [])), ...(aliases.data ?? []).map((a) => a.symbol)],
    themes: (themes.data ?? []).map((t) => t.slug),
    ignoredSymbols: (ignored.data ?? []).filter((i) => i.kind === "symbol").map((i) => i.token),
    ignoredThemes: (ignored.data ?? []).filter((i) => i.kind === "theme").map((i) => i.token),
  };
}
