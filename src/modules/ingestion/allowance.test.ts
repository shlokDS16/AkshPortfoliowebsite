import { describe, expect, it } from "vitest";
import { GROQ_CAPS, TOKENS_PER_PAGE_DEFAULT } from "./caps";
import { aiPagesToday } from "./allowance";

describe("AI pages today (the inbox meter)", () => {
  it("counts the day's allowance in pages at the default tokens per page: 150,000 tokens is 44 pages", () => {
    expect(aiPagesToday(0)).toEqual({ used: 0, total: 44 });
    expect(Math.floor(GROQ_CAPS.tpd / TOKENS_PER_PAGE_DEFAULT)).toBe(44);
  });

  it("rounds the tokens spent to whole pages", () => {
    expect(aiPagesToday(41 * TOKENS_PER_PAGE_DEFAULT)).toEqual({ used: 41, total: 44 });
    expect(aiPagesToday(Math.round(2.4 * TOKENS_PER_PAGE_DEFAULT)).used).toBe(2);
  });

  it("never shows more pages than the day allows (the ledger counts estimates too)", () => {
    expect(aiPagesToday(GROQ_CAPS.tpd + 20_000)).toEqual({ used: 44, total: 44 });
  });
});
