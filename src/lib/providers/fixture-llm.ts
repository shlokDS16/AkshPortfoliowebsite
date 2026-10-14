import DIGEST_TABLE from "./fixtures/digest.json";
import FIXTURE_TABLE from "./fixtures/extraction.json";
import type { LlmPort, LlmRequest, LlmResult } from "./llm";

// The fixture adapter (plan E6): local e2e and CI only, never on Vercel (createLlmPort refuses it there, R27).
// Answers from a committed table keyed by text in the user message; every answer goes through the request's
// schema, so a fixture that drifts from the extraction schema fails loudly as `invalid`.

/** `medium` is the answer to a re-read (reasoning effort medium) when it differs: the same page, thought through harder (Plan 2b Task 8). */
export type FixtureEntry = { when: string; output: unknown; medium?: unknown };

const FIXTURES = FIXTURE_TABLE as FixtureEntry[];
const DIGESTS = DIGEST_TABLE as FixtureEntry[];
const EMPTY_PAGE = { page_kind: "other", basis: "unknown", unit_header: null, current_header: null, prior_header: null, rows: [] };
// Small on purpose: three fixture reads in a minute must fit the 6,000 TPM cap, or the e2e would meet a real deferral.
const USAGE = { promptTokens: 800, completionTokens: 200, totalTokens: 1000 };
/** A page-classification request with no committed answer places nothing: the rules' choice stands. */
const NO_PAGES_PLACED = { pages: [] };
/** A page-digest request with no committed answer finds no claims. */
const NO_CLAIMS = { claims: [] };
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };

const answerFor = (entry: FixtureEntry | undefined, effort: LlmRequest<unknown>["reasoningEffort"]): unknown => (effort === "medium" && entry?.medium !== undefined ? entry.medium : entry?.output);

export function createFixtureLlm(table: readonly FixtureEntry[] = FIXTURES): LlmPort {
  return {
    name: "fixture",
    async complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
      // A digest request is answered from its own table, so a statement heading on the page can never pick a figures answer.
      const output = req.schemaName === "page_digest"
        ? (DIGESTS.find((entry) => req.user.includes(entry.when))?.output ?? NO_CLAIMS)
        : answerFor(table.find((entry) => req.user.includes(entry.when)), req.reasoningEffort) ?? (req.schemaName === "page_classification" ? NO_PAGES_PLACED : EMPTY_PAGE);
      const checked = req.schema.safeParse(output);
      if (!checked.success) {
        const issues = checked.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { kind: "invalid", raw: JSON.stringify(output).slice(0, 2000), issues, usage: USAGE, rate: NO_RATE };
      }
      return { kind: "ok", data: checked.data, usage: USAGE, rate: NO_RATE };
    },
  };
}
