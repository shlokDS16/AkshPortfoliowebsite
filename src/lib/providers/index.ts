import "server-only";
import { createFixtureLlm } from "./fixture-llm";
import { createGroqLlm } from "./groq";
import type { LlmPort } from "./llm";

export type { LlmPort, LlmRequest, LlmResult, LlmUsage, RateHeaders } from "./llm";

/** The slice of the server env that picks an adapter (passed in; this file never reads process.env). */
export type LlmEnv = { GROQ_API_KEY?: string; LLM_ADAPTER?: "groq" | "fixture"; VERCEL_ENV?: string };

const DEPLOYED = new Set(["preview", "production"]);

/**
 * The fixture wins when asked for; else Groq when a key is set; else null ("AI reading is off").
 * On a Vercel preview or production deployment the fixture is refused (ruling R27): a stray LLM_ADAPTER would
 * file fake figures, so AI reading stays off there until the variable is removed.
 */
export function createLlmPort(env: LlmEnv): LlmPort | null {
  if (env.LLM_ADAPTER === "fixture") {
    if (env.VERCEL_ENV && DEPLOYED.has(env.VERCEL_ENV)) {
      console.error("llm: LLM_ADAPTER=fixture is refused on a Vercel deployment; AI reading is off until it is removed");
      return null;
    }
    return createFixtureLlm();
  }
  return env.GROQ_API_KEY ? createGroqLlm({ apiKey: env.GROQ_API_KEY }) : null;
}
