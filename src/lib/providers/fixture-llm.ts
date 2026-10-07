import FIXTURE_TABLE from "./fixtures/extraction.json";
import type { LlmPort, LlmRequest, LlmResult } from "./llm";

// The fixture adapter (plan E6): local e2e and CI only, never on Vercel (createLlmPort refuses it there, R27).
// Answers from a committed table keyed by text in the user message; every answer goes through the request's
// schema, so a fixture that drifts from the extraction schema fails loudly as `invalid`.

export type FixtureEntry = { when: string; output: unknown };

const FIXTURES = FIXTURE_TABLE as FixtureEntry[];
const EMPTY_PAGE = { page_kind: "other", basis: "unknown", unit_header: null, current_header: null, prior_header: null, rows: [] };
const USAGE = { promptTokens: 2500, completionTokens: 500, totalTokens: 3000 };
const NO_RATE = { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null };

export function createFixtureLlm(table: readonly FixtureEntry[] = FIXTURES): LlmPort {
  return {
    name: "fixture",
    async complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
      const output = table.find((entry) => req.user.includes(entry.when))?.output ?? EMPTY_PAGE;
      const checked = req.schema.safeParse(output);
      if (!checked.success) {
        const issues = checked.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
        return { kind: "invalid", raw: JSON.stringify(output).slice(0, 2000), issues, usage: USAGE, rate: NO_RATE };
      }
      return { kind: "ok", data: checked.data, usage: USAGE, rate: NO_RATE };
    },
  };
}
