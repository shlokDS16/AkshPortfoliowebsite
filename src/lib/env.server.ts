import "server-only";
import { z } from "zod";
import { type EnvSource, parseEnv, publicSchema } from "./env";

// Server-only environment (secrets). `server-only` makes a client import a build error.

/** The template's empty values (`KEY=`) mean unset, never a crash. */
const blank = (v: unknown) => (v === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_", "must be a secret key (sb_secret_...)"),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("must be an email address")),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
  // AI reading (ADR-004 s3.5, spec s9). No key means AI reading is off; the app still runs.
  GROQ_API_KEY: optional(z.string().trim().min(20, "must be a Groq API key")),
  GROQ_MODEL_TEXT: z.preprocess(blank, z.string().trim().min(1).default("openai/gpt-oss-120b")),
  /** [DEV-ONLY] `fixture` for local e2e; createLlmPort refuses it on Vercel preview/production (ruling R27). */
  LLM_ADAPTER: optional(z.enum(["groq", "fixture"])),
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
