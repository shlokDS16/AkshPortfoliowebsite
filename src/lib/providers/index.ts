import "server-only";
import { createFixtureLlm } from "./fixture-llm";
import { createGroqLlm } from "./groq";
import { createFixtureOcr } from "./fixture-ocr";
import { createFixtureTranscriber } from "./fixture-transcriber";
import { createGroqWhisper } from "./groq-whisper";
import type { LlmPort } from "./llm";
import type { OcrPort } from "./ocr";
import { createOcrSpace } from "./ocrspace";
import type { TranscriberPort } from "./transcriber";

export type { LlmPort, LlmRequest, LlmResult, LlmUsage, RateHeaders } from "./llm";
export type { OcrFiletype, OcrPort, OcrResult } from "./ocr";
export type { TranscriberPort, TranscriberResult } from "./transcriber";

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

/** The slice of the server env that picks the OCR adapter (passed in; this file never reads process.env). */
export type OcrEnv = { OCRSPACE_API_KEY?: string; LLM_ADAPTER?: "groq" | "fixture"; VERCEL_ENV?: string };

/**
 * The fixture when LLM_ADAPTER=fixture (and not on Vercel, ruling R27: fake page text would reach the review screen);
 * else OCR.space when a key is set; else null ("Scan reading is off"). `maxBytes` is the file cap the job runner holds.
 */
export function createOcrPort(env: OcrEnv, opts: { maxBytes: number }): OcrPort | null {
  if (env.LLM_ADAPTER === "fixture") {
    if (env.VERCEL_ENV && DEPLOYED.has(env.VERCEL_ENV)) {
      console.error("ocr: LLM_ADAPTER=fixture is refused on a Vercel deployment; scan reading is off until it is removed");
      return null;
    }
    return createFixtureOcr();
  }
  return env.OCRSPACE_API_KEY ? createOcrSpace({ apiKey: env.OCRSPACE_API_KEY, maxBytes: opts.maxBytes }) : null;
}

/** The slice of the server env that picks the transcriber (passed in; this file never reads process.env). */
export type TranscriberEnv = { GROQ_API_KEY?: string; LLM_ADAPTER?: "groq" | "fixture"; VERCEL_ENV?: string; VOICE_NOTES?: "on" };

/**
 * Null unless VOICE_NOTES is "on": with the switch off nothing of a recording is ever sent anywhere (ruling R8, ADR-004 s8).
 * Then the fixture when LLM_ADAPTER=fixture (refused on Vercel, ruling R27: a made-up transcript would reach Aksh's desk);
 * else Groq Whisper when a key is set; else null ("Voice notes are not switched on yet").
 */
export function createTranscriberPort(env: TranscriberEnv, opts: { model: string }): TranscriberPort | null {
  if (env.VOICE_NOTES !== "on") return null;
  if (env.LLM_ADAPTER === "fixture") {
    if (env.VERCEL_ENV && DEPLOYED.has(env.VERCEL_ENV)) {
      console.error("transcriber: LLM_ADAPTER=fixture is refused on a Vercel deployment; voice notes are off until it is removed");
      return null;
    }
    return createFixtureTranscriber();
  }
  return env.GROQ_API_KEY ? createGroqWhisper({ apiKey: env.GROQ_API_KEY, model: opts.model }) : null;
}
