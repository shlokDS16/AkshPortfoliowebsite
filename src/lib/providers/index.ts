import "server-only";
import type { AlertMailer } from "./alert-mailer";
import { type AnchorPort, createOffAnchor } from "./anchor";
import { createFixtureAnchor, fixtureAnchorDirectory } from "./fixture-anchor";
import { createFixtureLlm } from "./fixture-llm";
import { createFixtureMarketData } from "./fixture-market-data";
import { createGithubGistAnchor } from "./github-gist";
import { createGroqLlm } from "./groq";
import { createFixtureOcr } from "./fixture-ocr";
import { createFixtureTranscriber } from "./fixture-transcriber";
import { createFixtureVideoMeta } from "./fixture-video-meta";
import { createGroqWhisper } from "./groq-whisper";
import type { LlmPort } from "./llm";
import type { MarketDataPort } from "./market-data";
import { createNseMarketData } from "./nse-bhavcopy";
import { DEFAULT_NSE_BHAVCOPY_TEMPLATE, DEFAULT_NSE_INDEX_TEMPLATE } from "./nse-template";
import type { OcrPort } from "./ocr";
import { createResendMailer, DEFAULT_ALERT_FROM } from "./resend-mailer";
import { createOcrSpace } from "./ocrspace";
import type { TranscriberPort } from "./transcriber";
import type { VideoMetaPort } from "./video-meta";
import { createYoutubeVideoMeta } from "./youtube";

export type { AlertMailer, AlertMessage, AlertSend } from "./alert-mailer";
export type { AnchorMiss, AnchorPort, AnchorRead, AnchorReadAll, AnchorWrite } from "./anchor";
export type { LlmPort, LlmRequest, LlmResult, LlmUsage, RateHeaders } from "./llm";
export type { Close, EquityDay, IndexDay, MarketDataPort, Miss } from "./market-data";
export type { OcrFiletype, OcrPort, OcrResult } from "./ocr";
export type { TranscriberPort, TranscriberResult } from "./transcriber";
export type { VideoMeta, VideoMetaPort, VideoMetaResult } from "./video-meta";

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

/** The slice of the server env that picks the market-data adapter (passed in; this file never reads process.env). */
export type MarketDataEnv = {
  NSE_BHAVCOPY_URL_TEMPLATE?: string;
  NSE_INDEX_URL_TEMPLATE?: string;
  LLM_ADAPTER?: "groq" | "fixture";
  VERCEL_ENV?: string;
  /** The database address: the fixture closes may be stored only in a database on this machine. */
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

/** True only for 127.0.0.1, localhost and [::1], matched on the parsed host (never a prefix: `localhost.evil.test` is not local). */
export function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * The fixture when LLM_ADAPTER=fixture; otherwise the NSE adapter, which needs no key. Never null.
 * The fixture's made-up closes are stored as official `nse_fetch` closes, the rank nothing can replace, so unlike the LLM
 * and OCR fixtures (whose output only reaches a review screen) it is created ONLY when the Supabase URL is a loopback
 * address (Plan 3a Task 6 fix round, review I-3). Anywhere else, whatever LLM_ADAPTER or VERCEL_ENV say, asking for it is
 * a configuration error that stops the job before a single close is fetched or stored. A template that does not point at
 * the NSE archive host throws here too, at start-up, rather than at the first fetch.
 */
export function createMarketDataPort(env: MarketDataEnv): MarketDataPort {
  if (env.LLM_ADAPTER === "fixture") {
    if (!isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
      throw new Error("market data: LLM_ADAPTER=fixture is only allowed with a local database (127.0.0.1, localhost or [::1]); remove it, or point NEXT_PUBLIC_SUPABASE_URL at the local stack");
    }
    return createFixtureMarketData();
  }
  return createNseMarketData({
    bhavcopyTemplate: env.NSE_BHAVCOPY_URL_TEMPLATE ?? DEFAULT_NSE_BHAVCOPY_TEMPLATE,
    indexTemplate: env.NSE_INDEX_URL_TEMPLATE ?? DEFAULT_NSE_INDEX_TEMPLATE,
  });
}

/** The slice of the server env that picks the anchor adapter (passed in; this file never reads process.env). */
export type AnchorEnv = {
  GITHUB_GIST_TOKEN?: string;
  LEDGER_ANCHOR_GIST_ID?: string;
  LLM_ADAPTER?: "groq" | "fixture";
  /** The database address: the fixture may be used only with a database on this machine. */
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

/**
 * Never null. With the token or the gist id unset (the default) the port is the "off" adapter: every call answers
 * `not_configured`, the day's line is sealed in the database and simply not published; that is not an error. The fixture
 * when LLM_ADAPTER=fixture, and, like the market-data fixture, only against a loopback database (a fixture "published"
 * state next to a hosted ledger would be a false claim of publication); anywhere else asking for it is a configuration error.
 * A malformed id or token throws here (the env parse refuses them too), naming the setting and never the value.
 */
export function createAnchorPort(env: AnchorEnv): AnchorPort {
  if (env.LLM_ADAPTER === "fixture") {
    if (!isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
      throw new Error("anchor: LLM_ADAPTER=fixture is only allowed with a local database (127.0.0.1, localhost or [::1]); remove it, or point NEXT_PUBLIC_SUPABASE_URL at the local stack");
    }
    // Kept in a directory named from the local database's address, so a restarted dev server still sees the "published" file.
    return createFixtureAnchor({ directory: fixtureAnchorDirectory(env.NEXT_PUBLIC_SUPABASE_URL as string) });
  }
  if (!env.GITHUB_GIST_TOKEN || !env.LEDGER_ANCHOR_GIST_ID) return createOffAnchor();
  return createGithubGistAnchor({ token: env.GITHUB_GIST_TOKEN, gistId: env.LEDGER_ANCHOR_GIST_ID });
}

/** The slice of the server env that picks the alert mailer (passed in; this file never reads process.env). */
export type AlertMailerEnv = { RESEND_API_KEY?: string; RESEND_FROM?: string; ALERT_EMAIL?: readonly string[] };

/**
 * Null while alert email is off: it needs RESEND_API_KEY and at least one ALERT_EMAIL address (ADMIN_EMAIL is not a fallback:
 * before a domain is verified Resend refuses every address but the account owner's own, so a guessed recipient would only fail).
 * A value of the wrong shape throws here, naming the setting and never the value; the alert step runs this inside itself, so
 * that becomes its own failed heartbeat and the steps before it are untouched.
 */
export function createAlertMailer(env: AlertMailerEnv): AlertMailer | null {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL?.length) return null;
  return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM ?? DEFAULT_ALERT_FROM, to: env.ALERT_EMAIL });
}


/** The slice of the server env that picks the video-metadata adapter (passed in; this file never reads process.env). */
export type VideoMetaEnv = { YOUTUBE_API_KEY?: string; YOUTUBE_CHANNEL_ID?: string; DISTRIBUTION_ADAPTER?: "fixture"; VERCEL_ENV?: string };

/**
 * Null while video listing is off: it needs BOTH `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` (spec s7.4, s9.1); one without the other
 * is off too, so a half-set pair cannot read another channel's videos as his. The fixture when `DISTRIBUTION_ADAPTER=fixture`
 * (local e2e and CI), refused on a Vercel preview or production deployment (it would make up a video's owner and privacy); then
 * the port is null, never the real adapter, so a stray variable cannot silently change what is read. A setting of the wrong shape
 * throws here, naming the setting and never the value; the steps build the port inside themselves, so that is one failed heartbeat.
 */
export function createVideoMetaPort(env: VideoMetaEnv): VideoMetaPort | null {
  if (env.DISTRIBUTION_ADAPTER === "fixture") {
    if (env.VERCEL_ENV && DEPLOYED.has(env.VERCEL_ENV)) {
      console.error("videos: DISTRIBUTION_ADAPTER=fixture is refused on a Vercel deployment; video listing is off until it is removed");
      return null;
    }
    return createFixtureVideoMeta(env.YOUTUBE_CHANNEL_ID ? { channelId: env.YOUTUBE_CHANNEL_ID } : {});
  }
  if (!env.YOUTUBE_API_KEY || !env.YOUTUBE_CHANNEL_ID) return null;
  return createYoutubeVideoMeta({ apiKey: env.YOUTUBE_API_KEY, channelId: env.YOUTUBE_CHANNEL_ID });
}
