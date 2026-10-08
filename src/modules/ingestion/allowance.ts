import { GROQ_CAPS, TOKENS_PER_PAGE_DEFAULT } from "./caps";

/** The day's free AI allowance in pages, for the inbox meter: tokens spent today over the tokens one page costs (spec s9). */
export function aiPagesToday(todayTokens: number): { used: number; total: number } {
  const total = Math.floor(GROQ_CAPS.tpd / TOKENS_PER_PAGE_DEFAULT);
  return { used: Math.min(total, Math.max(0, Math.round(todayTokens / TOKENS_PER_PAGE_DEFAULT))), total };
}
