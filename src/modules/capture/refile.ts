import { DeskError } from "@/lib/errors";
import { ensureCompany, ensureTheme } from "@/modules/catalog";
import { parseCapture } from "./parse";
import { bodyTooLong, fileCapture, type SaveCaptureDeps } from "./service";
import type { CaptureListEntry } from "./types";

export const REFILE_AFTER_MS = 10 * 60_000;
const LINK_WINDOW_MS = 15 * 60_000;

/** Not a `ResearchError`: the shared base is `DeskError` in src/lib/errors.ts (Plan 1A final review I5). */
export class CaptureNotRefilableError extends DeskError {
  readonly code = "CAPTURE_NOT_REFILABLE";
  constructor() {
    super("This capture is already filed, or is still being filed. Reload in a minute.");
    this.name = "CaptureNotRefilableError";
  }
}

type RefileView = Pick<CaptureListEntry, "itemId" | "parseError" | "parsedMissing" | "createdAt">;

/** No item, and either a recorded filing failure, or no parse at all after 10 minutes (killed function, lost link). */
export function needsRefile(entry: RefileView, now: Date): boolean {
  if (entry.itemId !== null) return false;
  if (entry.parseError === "filing-failed") return true;
  return entry.parsedMissing && now.getTime() - new Date(entry.createdAt).getTime() >= REFILE_AFTER_MS;
}

/** A thesis at its length limit would fail every time: record that so the row stops being offered for refiling. */
async function fileCaptureOrMark(deps: SaveCaptureDeps, captureId: string, parsed: ReturnType<typeof parseCapture>) {
  try {
    return await fileCapture(deps, parsed);
  } catch (error) {
    if (bodyTooLong(error)) {
      await deps.captures.attach(captureId, { parsed: { ...parsed, error: "thesis-full" } }).catch(() => undefined);
    }
    throw error;
  }
}

/** Files a stored capture again. If an item already holds its text (the link was lost), links that item instead. */
export async function refileCapture(deps: SaveCaptureDeps, captureId: string, now: Date): Promise<{ itemId: string }> {
  const record = await deps.captures.findById(captureId);
  if (!record) throw new CaptureNotRefilableError();
  const error = record.parsed?.error;
  const view: RefileView = {
    itemId: record.itemId,
    parseError: error === "filing-failed" ? "filing-failed" : null,
    parsedMissing: record.parsed === null,
    createdAt: record.createdAt,
  };
  if (!needsRefile(view, now)) throw new CaptureNotRefilableError();

  const parsed = parseCapture(record.rawText);
  const until = new Date(new Date(record.createdAt).getTime() + LINK_WINDOW_MS).toISOString();
  // An empty body matches every revision, so it never counts as "already filed".
  const existing = parsed.body.trim() === "" ? null : await deps.research.findRevisionContaining(parsed.body, record.createdAt, until);
  const filed = existing
    ? {
        itemId: existing.itemId,
        company: parsed.symbols[0] ? await ensureCompany(deps.catalog, parsed.symbols[0]) : null,
        theme: parsed.themes[0] ? await ensureTheme(deps.catalog, parsed.themes[0]) : null,
      }
    : await fileCaptureOrMark(deps, record.id, parsed);
  await deps.captures.attach(record.id, {
    parsed: { ...parsed },
    itemId: filed.itemId,
    companyId: filed.company?.id ?? null,
    themeId: filed.theme?.id ?? null,
  });
  return { itemId: filed.itemId };
}
