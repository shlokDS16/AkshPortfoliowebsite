import { z } from "zod";
import { DbError, isUniqueViolation } from "@/lib/supabase/errors";
import { ensureCompany, ensureTheme, type CatalogRepo, type Company, type Theme } from "@/modules/catalog";
import { appendRevision, createItem, type ResearchRepo } from "@/modules/research";
import { asFilingError, CAPTURE_TOO_LONG_MESSAGE, EMPTY_CAPTURE_MESSAGE, type FilingErrorCode } from "./messages";
import { parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
import { clipUnits } from "./text";
import { CAPTURE_SOURCES, type CaptureRecord, type CaptureRepo } from "./types";

export const saveCaptureInput = z.object({
  rawText: z
    .string()
    .max(20_000, CAPTURE_TOO_LONG_MESSAGE)
    .refine((text) => text.trim().length > 0, EMPTY_CAPTURE_MESSAGE),
  source: z.enum(CAPTURE_SOURCES),
  clientId: z.guid(),
});
export type SaveCaptureInput = z.input<typeof saveCaptureInput>;
export type SaveCaptureDeps = { captures: CaptureRepo; catalog: CatalogRepo; research: ResearchRepo };
export type SaveCaptureResult = {
  captureId: string;
  itemId: string | null;
  kind: CaptureKind | null;
  duplicate: boolean;
  /** A fixed code (see messages.ts), never error text. */
  parseError: FilingErrorCode | null;
};

// UTF-16 units, matching the research schema's changeReason .max(300).
const REASON_MAX = 300;

const duplicateOf = (record: CaptureRecord): SaveCaptureResult => ({
  captureId: record.id,
  itemId: record.itemId,
  kind: null,
  duplicate: true,
  // A retry of a capture that could not be filed must say so, not look like a clean save.
  parseError: asFilingError(record.parsed?.error),
});

/** Name, operation and SQLSTATE only: enough to debug, never a message that could carry data. */
function failureDetail(error: unknown): string {
  if (error instanceof DbError) return [error.name, error.op, error.code].filter(Boolean).join(" ");
  return error instanceof Error ? error.name : typeof error;
}

type Filed = { itemId: string; company: Company | null; theme: Theme | null };

async function fileCapture(deps: SaveCaptureDeps, parsed: ParsedCapture): Promise<Filed> {
  const company = parsed.symbols[0] ? await ensureCompany(deps.catalog, parsed.symbols[0]) : null;
  const theme = parsed.themes[0] ? await ensureTheme(deps.catalog, parsed.themes[0]) : null;
  if (parsed.kind === "thesis" && company) {
    const existing = await deps.research.findThesisForCompany(company.id);
    if (existing) {
      const changeReason = clipUnits(parsed.firstLine, REASON_MAX).trim() || null;
      await appendRevision(deps.research, { itemId: existing.id, appendMd: parsed.body, changeReason });
      return { itemId: existing.id, company, theme };
    }
  }
  const title = parsed.kind === "thesis" && company ? `${company.nseSymbol ?? company.name} thesis` : parsed.title;
  const { item } = await createItem(deps.research, {
    kind: parsed.kind,
    title,
    bodyMd: parsed.body,
    companyId: company?.id ?? null,
    themeId: theme?.id ?? null,
  });
  return { itemId: item.id, company, theme };
}

/**
 * Spec s5: the capture is stored verbatim BEFORE any parsing, so nothing is lost if filing fails.
 * A repeated clientId (offline queue retry or double submit) is a no-op that returns the first result.
 * Throws only when the raw text could not be stored at all; the caller then keeps it on the device.
 */
export async function saveCapture(deps: SaveCaptureDeps, input: SaveCaptureInput): Promise<SaveCaptureResult> {
  const data = saveCaptureInput.parse(input);
  const existing = await deps.captures.findByClientId(data.clientId);
  if (existing) return duplicateOf(existing);

  let capture: CaptureRecord;
  try {
    capture = await deps.captures.insertRaw(data);
  } catch (error) {
    const raced = isUniqueViolation(error) ? await deps.captures.findByClientId(data.clientId) : null;
    if (raced) return duplicateOf(raced);
    throw error;
  }

  const parsed = parseCapture(data.rawText);
  let filed: Filed;
  try {
    filed = await fileCapture(deps, parsed);
  } catch (error) {
    console.error("capture filing failed", failureDetail(error));
    try {
      await deps.captures.attach(capture.id, {
        parsed: { ...parsed, error: "filing-failed", errorDetail: failureDetail(error) },
      });
    } catch {
      // The raw text is already stored; the failure marker is a convenience, not the record.
    }
    return { captureId: capture.id, itemId: null, kind: parsed.kind, duplicate: false, parseError: "filing-failed" };
  }

  try {
    await deps.captures.attach(capture.id, {
      parsed: { ...parsed },
      itemId: filed.itemId,
      companyId: filed.company?.id ?? null,
      themeId: filed.theme?.id ?? null,
    });
  } catch (error) {
    // The item exists; only the back-link is missing. Report the item so the UI does not offer a re-file.
    console.error("capture link failed", failureDetail(error));
    return { captureId: capture.id, itemId: filed.itemId, kind: parsed.kind, duplicate: false, parseError: "link-failed" };
  }
  return { captureId: capture.id, itemId: filed.itemId, kind: parsed.kind, duplicate: false, parseError: null };
}
