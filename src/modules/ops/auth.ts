import { timingSafeEqual } from "node:crypto";

/** Vercel cron and the GitHub pump send `Authorization: Bearer <CRON_SECRET>`. Constant-time compare. */
export function isAuthorizedBearer(header: string | null, secret: string): boolean {
  if (!header || secret.length === 0) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
