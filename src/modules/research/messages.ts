import { ZodError } from "zod";
import { DbError } from "@/lib/supabase/errors";
import { ResearchError } from "./errors";

const FALLBACK = "Could not save. Try again.";

/**
 * The only text a desk screen may show for a failure: validation messages and typed
 * ResearchErrors. A DbError or anything unknown becomes the fallback; raw SQL never reaches the UI.
 */
export function userMessage(error: unknown): string {
  if (error instanceof ZodError) return [...new Set(error.issues.map((issue) => issue.message))].join("; ");
  if (error instanceof ResearchError) return error.message;
  return FALLBACK;
}

/** What the server log may record about a failure the user was not told about: no message text. */
export function logShape(error: unknown): { name: string; op?: string; code?: string } | null {
  if (error instanceof ZodError || error instanceof ResearchError) return null;
  if (error instanceof DbError) return { name: error.name, op: error.op, code: error.code };
  return { name: error instanceof Error ? error.name : typeof error };
}

/** One-time confirmations carried in the redirect URL as a fixed code, never as free text. */
const NOTICES = {
  "details-saved": "Details saved.",
  "revision-saved": "Revision saved.",
  "revision-pending-gate":
    "Revision saved. This item is public, so the new revision is waiting for the publishing gate; the public page still shows the previous one.",
} as const;

export type ItemNoticeCode = keyof typeof NOTICES;

export function noticeText(code: string | undefined): string | null {
  return code !== undefined && Object.hasOwn(NOTICES, code) ? NOTICES[code as ItemNoticeCode] : null;
}
