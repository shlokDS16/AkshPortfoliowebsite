// Which letters adapter an environment may use, and whether the three settings are usable. PURE: no adapter, no network, no logging, no
// process.env (the slice of the env is passed in). It lives apart from index.ts so the public sign-up page can ask "is email set up?"
// without reaching an adapter (src/modules/showcase/isolation.letters.test.ts). Spec s8.8 and s9.1; review findings 8 and 9.

/** True only for 127.0.0.1, localhost and [::1], matched on the parsed host (never a prefix: `localhost.evil.test` is not local). */
export function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

const DEPLOYED = new Set(["preview", "production"]);
const KEY_SHAPE = /^re_[A-Za-z0-9_-]{6,200}$/;
/** A bare address, or `Name <address>`; group 1 or 2 is the domain. */
const SENDER = /^(?:[^<>]{0,100}<[^\s@<>,;"]+@([^\s@<>,;"]+\.[^\s@<>,;"]+)>|[^\s@<>,;"]+@([^\s@<>,;"]+\.[^\s@<>,;"]+))$/;
const SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;

export type LetterSettings = { apiKey: string; from: string; segmentId: string };

/** The first thing wrong with the three settings, naming the setting and never its value; null when they are usable. */
export function letterSettingsProblem(s: LetterSettings): string | null {
  if (!KEY_SHAPE.test(s.apiKey)) return "RESEND_LETTERS_KEY does not have the shape of a Resend key (re_...)";
  const sender = s.from.length <= 200 && !CONTROL.test(s.from) ? SENDER.exec(s.from.trim()) : null;
  if (!sender) return "LETTERS_FROM must be an address, or Name <address>, on one line";
  if (/(^|\.)resend\.dev$/i.test(sender[1] ?? sender[2] ?? "")) return "LETTERS_FROM must be on your own domain (set up in Resend), not resend.dev";
  if (!SEGMENT.test(s.segmentId)) return "LETTERS_SEGMENT_ID must be a Resend segment id";
  return null;
}

/** The slice of the server env that picks the letters adapter (passed in; this file never reads process.env). */
export type LettersEnv = {
  RESEND_LETTERS_KEY?: string;
  LETTERS_FROM?: string;
  LETTERS_SEGMENT_ID?: string;
  /** The one recipient a self test can have. */
  ADMIN_EMAIL: string;
  DISTRIBUTION_ADAPTER?: "fixture";
  VERCEL_ENV?: string;
  /** Set by CI providers (and by Vercel at build time only). */
  CI?: string;
  NODE_ENV?: string;
  /** Set by vitest. */
  VITEST?: string;
  /** The database address: the fixture is allowed only against a database on this machine (review finding 9). */
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

export type LettersOffReason = "not_set_up" | "not_production" | "test_or_ci" | "fixture_refused" | "bad_setting";
export type LettersMode = { mode: "resend" | "fixture" } | { mode: "off"; reason: LettersOffReason };

const isTestOrCi = (env: LettersEnv) =>
  (env.CI !== undefined && env.CI !== "" && env.CI !== "0" && env.CI.toLowerCase() !== "false") || Boolean(env.VITEST) || env.NODE_ENV === "test";

/**
 * Which letters adapter this environment may use (spec s8.8, s9.1). Pure: no logging, no network.
 * The fixture when DISTRIBUTION_ADAPTER=fixture, refused on a Vercel preview or production deployment and against any database that is
 * not on this machine (a dev server pointed at the hosted project would otherwise record a send nobody got; then off, never the real
 * adapter). Otherwise Resend only when RESEND_LETTERS_KEY, LETTERS_FROM and LETTERS_SEGMENT_ID are all set, VERCEL_ENV is exactly
 * `production`, this is not a test or CI run, and the three settings have the right shape (the sender not on resend.dev).
 */
export function lettersMode(env: LettersEnv): LettersMode {
  const off = (reason: LettersOffReason): LettersMode => ({ mode: "off", reason });
  if (env.DISTRIBUTION_ADAPTER === "fixture") {
    if (env.VERCEL_ENV && DEPLOYED.has(env.VERCEL_ENV)) return off("fixture_refused");
    return isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL) ? { mode: "fixture" } : off("fixture_refused");
  }
  const { RESEND_LETTERS_KEY: apiKey, LETTERS_FROM: from, LETTERS_SEGMENT_ID: segmentId } = env;
  if (!apiKey || !from || !segmentId) return off("not_set_up");
  if (env.VERCEL_ENV !== "production") return off("not_production");
  if (isTestOrCi(env)) return off("test_or_ci");
  if (letterSettingsProblem({ apiKey, from, segmentId })) return off("bad_setting");
  return { mode: "resend" };
}
