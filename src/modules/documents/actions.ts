"use server";

import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { MAX_PAGE_NO } from "./limits";
import { pageTexts, readPage, searchPageText, snippetAround } from "./read";
import type { PageKind } from "./types";
import { onPage, valueOnPage } from "./verbatim";

// The document pane's reads. Read-only: the pane never writes a fact or a revision (the Facts form is the only save path).
// Every action checks the admin first and reads on the admin's own cookie session, so RLS applies.

const MAX_QUERY = 200;
const MAX_CHECKS = 100;
const MAX_QUOTE = 2000;

const validPage = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_PAGE_NO;

export type ReadPageResult = { ok: true; text: string; pageCount: number; kind: PageKind | null } | { ok: false; message: string };
export type PageHit = { pageNo: number; snippet: string };
export type QuoteCheckItem = { factId: string; pageNo: number; quote: string; valueText: string };
export type QuoteCheckResult = { factId: string; quoteFound: boolean; valueFound: boolean };

const NO_PAGE = "That page is not in this document.";

/** One page's text, with the document's page count and what the page was recognised as. */
export async function readPageAction(documentId: string, pageNo: number): Promise<ReadPageResult> {
  await requireAdmin();
  if (!isUuid(documentId) || !validPage(pageNo)) return { ok: false, message: NO_PAGE };
  try {
    const page = await readPage(await createSupabaseServerClient(), documentId, pageNo);
    return page ? { ok: true, ...page } : { ok: false, message: NO_PAGE };
  } catch (error) {
    console.error("document page read failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: "The page could not be read. Try again." };
  }
}

/** Up to 10 pages that hold every word of the query, each with about 160 characters around the first hit. */
export async function searchPagesAction(documentId: string, query: string): Promise<PageHit[]> {
  await requireAdmin();
  const q = typeof query === "string" ? query.trim().slice(0, MAX_QUERY) : "";
  if (!isUuid(documentId) || q === "") return [];
  try {
    const rows = await searchPageText(await createSupabaseServerClient(), documentId, q);
    return rows.map((r) => ({ pageNo: r.pageNo, snippet: snippetAround(r.text, q) }));
  } catch (error) {
    console.error("document search failed", error instanceof Error ? error.name : "unknown");
    return [];
  }
}

/** For each fact: is its quote on the page it cites, word for word, and is its value printed there (verbatim.ts). */
export async function checkQuotesAction(documentId: string, items: QuoteCheckItem[]): Promise<QuoteCheckResult[]> {
  await requireAdmin();
  if (!isUuid(documentId) || !Array.isArray(items)) return [];
  const asked = items
    .slice(0, MAX_CHECKS)
    .filter((i) => i && typeof i.factId === "string" && validPage(i.pageNo) && typeof i.quote === "string" && typeof i.valueText === "string");
  try {
    const texts = await pageTexts(await createSupabaseServerClient(), documentId, [...new Set(asked.map((i) => i.pageNo))]);
    return asked.map((i) => {
      const text = texts.get(i.pageNo);
      return {
        factId: i.factId,
        quoteFound: text !== undefined && onPage(i.quote.slice(0, MAX_QUOTE), text),
        valueFound: text !== undefined && valueOnPage(i.valueText.slice(0, MAX_QUOTE), text),
      };
    });
  } catch (error) {
    console.error("quote check failed", error instanceof Error ? error.name : "unknown");
    return []; // no answer is not "not found": the pane says the check could not run
  }
}
