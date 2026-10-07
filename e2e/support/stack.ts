import { execFileSync } from "node:child_process";

/** Matches supabase/seed.sql (private.settings admin_email). Local stack only. */
export const E2E_ADMIN_EMAIL = "admin@desk.test";
export const E2E_CRON_SECRET = "e2e-only-cron-secret-0123456789abcdef0123";
export const E2E_PORT = 3100;
export const E2E_SITE_URL = `http://127.0.0.1:${E2E_PORT}`;
/** Written by the `setup` project, read by the desk projects. Git-ignored (e2e/.auth/). */
export const ADMIN_STATE = "e2e/.auth/admin.json";

export type LocalStack = { apiUrl: string; publishableKey: string; secretKey: string; mailpitUrl: string };

/**
 * Reads the running LOCAL Supabase stack from `supabase status -o env`. Returns null when the
 * CLI or the stack is absent (CI's anon-only job). Never reads .env.local, which holds the
 * hosted project's credentials, and never prints a value.
 */
export function readLocalStack(): LocalStack | null {
  let out: string;
  try {
    // The project's pinned CLI (devDependency), never whatever `supabase` is first on PATH.
    out = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    });
  } catch {
    return null;
  }
  const values = new Map<string, string>();
  for (const line of out.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) values.set(match[1], match[2]);
  }
  const apiUrl = values.get("API_URL");
  const publishableKey = values.get("PUBLISHABLE_KEY");
  const secretKey = values.get("SECRET_KEY");
  const mailpitUrl = values.get("MAILPIT_URL") ?? values.get("INBUCKET_URL");
  if (!apiUrl || !publishableKey || !secretKey || !mailpitUrl) return null;
  // Defence in depth: the e2e helpers write with the secret key, so it must be the local stack.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(apiUrl)) {
    throw new Error("supabase status reports a non-local API URL; refusing to run e2e against it.");
  }
  return { apiUrl, publishableKey, secretKey, mailpitUrl };
}

/** Explicit values for every variable the app reads, so a stray .env.local can never win. */
export function appEnv(stack: LocalStack): Record<string, string> {
  return {
    NEXT_PUBLIC_SITE_URL: E2E_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: stack.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
    SUPABASE_SECRET_KEY: stack.secretKey,
    ADMIN_EMAIL: E2E_ADMIN_EMAIL,
    CRON_SECRET: E2E_CRON_SECRET,
    // The committed answers stand in for Groq (src/lib/providers/fixtures). Set here and never on Vercel, which refuses it.
    LLM_ADAPTER: "fixture",
  };
}
