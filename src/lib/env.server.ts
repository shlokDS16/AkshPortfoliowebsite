import "server-only";
import { z } from "zod";
import { type EnvSource, parseEnv, publicSchema } from "./env";
import {
  BHAVCOPY_PLACEHOLDER,
  DEFAULT_NSE_BHAVCOPY_TEMPLATE,
  DEFAULT_NSE_INDEX_TEMPLATE,
  INDEX_PLACEHOLDER,
  type NsePlaceholder,
  nseTemplateProblem,
} from "./providers/nse-template";

// Server-only environment (secrets). `server-only` makes a client import a build error.

/** The template's empty values (`KEY=`) mean unset, never a crash. */
const blank = (v: unknown) => (v === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

/** An NSE address template with its default; it must be https on the NSE archive host and carry its date placeholder (Plan 3a Task 6). */
const nseTemplate = (placeholder: NsePlaceholder, fallback: string) =>
  z.preprocess(
    blank,
    z.string().trim().default(fallback).superRefine((value, ctx) => {
      const problem = nseTemplateProblem(value, placeholder);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  );

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_", "must be a secret key (sb_secret_...)"),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("must be an email address")),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
  // AI reading (ADR-004 s3.5, spec s9). No key means AI reading is off; the app still runs.
  GROQ_API_KEY: optional(z.string().trim().min(20, "must be a Groq API key")),
  GROQ_MODEL_TEXT: z.preprocess(blank, z.string().trim().min(1).default("openai/gpt-oss-120b")),
  /** Reads a photo or screenshot of a table, one image per call (spec s9; https://console.groq.com/docs/vision). */
  GROQ_MODEL_VISION: z.preprocess(blank, z.string().trim().min(1).default("qwen/qwen3.8-27b")),
  /** Sorts the pages the rules could not place, ten openings per call (spec s9; https://console.groq.com/docs/rate-limits). */
  GROQ_MODEL_CLASSIFY: z.preprocess(blank, z.string().trim().min(1).default("openai/gpt-oss-20b")),
  /** Transcribes a voice note (spec s9; https://console.groq.com/docs/speech-to-text). Free tier: 25 MB a file. */
  GROQ_MODEL_WHISPER: z.preprocess(blank, z.string().trim().min(1).default("whisper-large-v3-turbo")),
  /**
   * Voice notes send Aksh's recordings to Groq (ADR-004 s8). `on` or unset; unset is off, and nothing is uploaded or sent.
   * Switch it on only after Aksh has agreed; his consent is not recorded yet.
   */
  VOICE_NOTES: optional(z.enum(["on"])),
  /** [DEV-ONLY] `fixture` for local e2e; createLlmPort refuses it on Vercel preview/production (ruling R27). */
  LLM_ADAPTER: optional(z.enum(["groq", "fixture"])),
  // Scanned pages (spec s9, Plan 2b Task 2). No key means "Scan reading is off"; the app still runs.
  OCRSPACE_API_KEY: optional(z.string().trim().min(8, "must be an OCR.space API key")),
  // Market data (Plan 3a Task 6; ADR-005 s2). No key: NSE's public archive. The host is fixed in code; these change the path only.
  NSE_BHAVCOPY_URL_TEMPLATE: nseTemplate(BHAVCOPY_PLACEHOLDER, DEFAULT_NSE_BHAVCOPY_TEMPLATE),
  NSE_INDEX_URL_TEMPLATE: nseTemplate(INDEX_PLACEHOLDER, DEFAULT_NSE_INDEX_TEMPLATE),
  /** Set by Vercel (development | preview | production); unset locally and in CI. */
  VERCEL_ENV: optional(z.string().trim()),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: EnvSource): ServerEnv {
  return parseEnv(serverSchema, source);
}

let cachedServer: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}
