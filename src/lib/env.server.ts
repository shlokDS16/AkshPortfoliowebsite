import "server-only";
import { z } from "zod";
import { type EnvSource, parseEnv, publicSchema } from "./env";
import { DEFAULT_ALERT_FROM } from "./providers/resend-mailer";
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

/** One address or a comma-separated list: trimmed, lower-cased, no empty entries, no repeats; none left means unset. */
const addressList = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v === "" ? undefined : v;
    const list = [...new Set(v.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean))];
    return list.length > 0 ? list : undefined;
  },
  z.array(z.string()).optional(),
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
  // The public anchor (Plan 3a Task 8; ADR-005 s3.3). Both owner-set; either unset means the days are sealed and not published.
  /** A fine-grained token with the user permission "Gists: write". Letters, digits, underscore, dot, hyphen only. */
  GITHUB_GIST_TOKEN: optional(z.string().trim().regex(/^[A-Za-z0-9_.-]{20,255}$/, "must be a GitHub token")),
  /** The id of a public gist the owner created by hand. Strict, because it becomes part of an address. */
  LEDGER_ANCHOR_GIST_ID: optional(z.string().trim().regex(/^[0-9a-f]{20,40}$/, "must be a gist id (20 to 40 lowercase hex characters)")),
  // The alert email (2.9; docs/specs/2026-10-14-alert-email-design.md s3). Off unless the key and ALERT_EMAIL are both set. Their
  // SHAPE is checked where the mail is built (src/lib/providers/resend-mailer.ts), not here: a typo then fails only the
  // `alerts:email` step, visible in the heartbeat log, instead of stopping every page and job (a parse error is app-wide).
  RESEND_API_KEY: optional(z.string().trim()),
  /** One address or a comma-separated list. Until a domain is verified at Resend it must be the Resend account's own address (Q36). */
  ALERT_EMAIL: addressList,
  /** The sender. Without a verified domain Resend allows only onboarding@resend.dev, and only to the account's own address. */
  RESEND_FROM: z.preprocess(blank, z.string().trim().min(1).default(DEFAULT_ALERT_FROM)),
  // Videos (Phase 5b, spec s7.4 and s9). Both owner-set, or neither: video listing is off until then, and nothing is read from YouTube.
  /** A YouTube Data API v3 key restricted to that API (Google Cloud). Letters, digits, underscore and hyphen only. */
  YOUTUBE_API_KEY: optional(z.string().trim().regex(/^[A-Za-z0-9_-]{20,128}$/, "must be a YouTube Data API key")),
  /** Aksh's channel id: "UC" and 22 more characters. A video from any other channel is never listed. */
  YOUTUBE_CHANNEL_ID: optional(z.string().trim().regex(/^UC[A-Za-z0-9_-]{22}$/, "must be a YouTube channel id (UC followed by 22 characters)")),
  /** [DEV-ONLY] `fixture` for local e2e: no YouTube or email call is made. createVideoMetaPort refuses it on Vercel preview/production. */
  DISTRIBUTION_ADAPTER: optional(z.enum(["fixture"])),
  // Letters (Phase 5c, spec s8.8 and s9). All three owner-set, or letters are off: nothing is sent and the sign-up form is not shown.
  // Their SHAPE is checked where letters are built (src/lib/providers/resend-letters.ts), so a typo turns letters off, not the app.
  /** A FULL-ACCESS Resend key (broadcasts and contacts need it), separate from RESEND_API_KEY, which can stay sending-only. */
  RESEND_LETTERS_KEY: optional(z.string().trim()),
  /** `Aksh Agrawal <letters@{verified domain}>`: an address on a domain verified at Resend, never resend.dev. */
  LETTERS_FROM: optional(z.string().trim()),
  /** The Resend segment the letters go to (Audiences are now Segments). */
  LETTERS_SEGMENT_ID: optional(z.string().trim()),
  /** Set by Vercel (development | preview | production); unset locally and in CI. Letters send only when it is `production`. */
  VERCEL_ENV: optional(z.string().trim()),
  /** Set by CI providers (and by Vercel at build time only). Letters never send while it is set. */
  CI: optional(z.string().trim()),
  /** Set by Next.js and vitest. Letters never send under `test`. */
  NODE_ENV: optional(z.string().trim()),
  /** Set by vitest. Letters never send while it is set. */
  VITEST: optional(z.string().trim()),
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
