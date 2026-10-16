import { z, ZodError } from "zod";
import { DeskError, errorShapeText } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/supabase/errors";
import { ensureCompany, ensureTheme, type CatalogRepo, type Company, type Theme } from "@/modules/catalog";
import { appendRevision, BODY_TOO_LONG_MESSAGE, createItem, type ResearchRepo } from "@/modules/research";
import { asFilingError, CAPTURE_TOO_LONG_MESSAGE, EMPTY_CAPTURE_MESSAGE, type FilingErrorCode } from "./messages";
import { MAX_LINKED_CONCEPTS, parseCapture, type CaptureKind, type ParsedCapture } from "./parse";
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
/**
 * What a `v:` capture needs from the distribution module, passed in by the action (this file is reachable from the public pages, which may
 * import nothing of distribution but its public entry; distribution's `createVideoFiling` builds one). Without it a `v:` capture is not
 * filed at all, never an item with no source.
 */
export interface VideoFiling {
  parseLink(url: string): string | null;
  initialStructured(youtubeId: string): Record<string, unknown>;
  findByYoutubeId(youtubeId: string): Promise<{ itemId: string } | null>;
  insertSource(itemId: string, youtubeId: string): Promise<unknown>;
}
/**
 * What an `s:` capture needs from the sources module (Phase 5d), passed in by the action for the same reason as `VideoFiling` (sources'
 * `createSourceFiling` builds one). A `v:` capture is filed through it when there is no `videos` filing (the own-channel videos are off).
 * Without it an `s:` capture is not filed at all, never half filed.
 */
export interface SourceFiling {
  /** The link as it would be saved, or null when it is not a link a source can be. */
  parseLink(url: string): string | null;
  save(input: { url: string; note: string; companyIds: string[]; themeIds: string[] }): Promise<{ id: string; answer: string; duplicate: boolean }>;
}
export type SaveCaptureDeps = { captures: CaptureRepo; catalog: CatalogRepo; research: ResearchRepo; videos?: VideoFiling; sources?: SourceFiling };
export type SaveCaptureResult = {
  captureId: string;
  itemId: string | null;
  kind: CaptureKind | null;
  duplicate: boolean;
  /** A fixed code (see messages.ts), never error text. */
  parseError: FilingErrorCode | null;
  /** What the desk says about a saved source (fixed sentences from the sources module); absent for every other kind. */
  sourceAnswer?: string;
  /** The id of a source saved for the first time: the action starts its first read after the answer (a repeat is not read again). */
  sourceReadId?: string;
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

/** `theme` is the first concept (items.theme_id, kept for the gate's theme check); `themes` is every one linked, in order. */
type Filed = { itemId: string | null; company: Company | null; theme: Theme | null; themes: Theme[]; sourceAnswer?: string; sourceReadId?: string };

/** A source note past the 4,000 characters a source holds (the sources module's own typed refusal) is not a failure to retry either. */
const isSourceNoteFull = (e: unknown) => e instanceof DeskError && e.code === "source-note-full";

/** A thesis append past the body limit is not a failure to retry: filing it again would fail the same way. */
export const bodyTooLong = (e: unknown) => e instanceof ZodError && e.issues.some((i) => i.message === BODY_TOO_LONG_MESSAGE);

/** The first token that resolves to a row; ignored tokens resolve to null and are skipped. */
export async function firstResolved<T>(tokens: string[], resolve: (token: string) => Promise<T | null>): Promise<T | null> {
  for (const token of tokens) {
    const found = await resolve(token);
    if (found) return found;
  }
  return null;
}

/**
 * Every #name in order that resolves to a row (an ignored one is skipped and takes no place), at most 8. Resolution stops
 * at the 8th, so a 9th tag makes no stub: it stays plain text in the body.
 */
export async function resolveConcepts(catalog: CatalogRepo, tokens: string[]): Promise<Theme[]> {
  const found = new Map<string, Theme>();
  for (const token of tokens) {
    if (found.size >= MAX_LINKED_CONCEPTS) break;
    const theme = await ensureTheme(catalog, token);
    if (theme) found.set(theme.id, theme);
  }
  return [...found.values()];
}

/** A `v:` capture with no YouTube video address in it (spec s7.1). Recorded as the filing error `not-youtube-link`; nothing is filed. */
export class NotYoutubeLinkError extends Error {
  constructor() {
    super("not a YouTube link");
    this.name = "NotYoutubeLinkError";
  }
}

/** The first address in the capture that is one of the four YouTube video shapes, with its id. */
function firstYoutubeLink(videos: VideoFiling, urls: readonly string[]): { url: string; id: string } | null {
  for (const url of urls) {
    const id = videos.parseLink(url);
    if (id) return { url, id };
  }
  return null;
}

/**
 * Files a `v:` capture as a private `video` item titled "Video {id}" and its `video_sources` row (the fetch fills YouTube's data later).
 * The body is his own text with only the YouTube address taken out. A video already filed is opened, not filed twice.
 */
async function fileVideo(deps: SaveCaptureDeps, parsed: ParsedCapture): Promise<Filed> {
  if (!deps.videos) throw new Error("filing a video needs the videos repo");
  const link = firstYoutubeLink(deps.videos, parsed.urls);
  if (!link) throw new NotYoutubeLinkError();
  const existing = await deps.videos.findByYoutubeId(link.id);
  if (existing) return { itemId: existing.itemId, company: null, theme: null, themes: [] };
  // Company and concepts are resolved only now, so a refused or repeated link leaves no stub names behind.
  const company = await firstResolved(parsed.symbols, (s) => ensureCompany(deps.catalog, s));
  const themes = await resolveConcepts(deps.catalog, parsed.themes);
  const { item } = await createItem(deps.research, {
    kind: "video",
    title: `Video ${link.id}`,
    bodyMd: parsed.body.replace(link.url, "").trim(),
    companyId: company?.id ?? null,
    themeId: themes[0]?.id ?? null,
    conceptIds: themes.length > 0 ? themes.map((t) => t.id) : null,
    structured: deps.videos.initialStructured(link.id),
  });
  await deps.videos.insertSource(item.id, link.id);
  return { itemId: item.id, company, theme: themes[0] ?? null, themes };
}

/** An `s:` capture with no link a source can be (spec s6.1). Recorded as the filing error `no-source-link`; nothing is filed. */
export class NoSourceLinkError extends Error {
  constructor() {
    super("no source link");
    this.name = "NoSourceLinkError";
  }
}

/** The most companies one source is attached to (migration 0026; sources' MAX_SOURCE_COMPANIES says the same, a test keeps them equal). */
export const MAX_SOURCE_COMPANIES = 5;

/** Every $symbol in order that resolves to a company (an ignored one is skipped), at most 5. */
async function resolveCompanies(catalog: CatalogRepo, tokens: string[]): Promise<Company[]> {
  const found = new Map<string, Company>();
  for (const token of tokens) {
    if (found.size >= MAX_SOURCE_COMPANIES) break;
    const company = await ensureCompany(catalog, token);
    if (company) found.set(company.id, company);
  }
  return [...found.values()];
}

/**
 * Files an `s:` capture (or a `v:` while the own-channel videos are off) as a source: no item is made. The note is his text with only the
 * prefix and the chosen link taken out; his tags stay in it. Companies and concepts are resolved only after the link is known to be usable,
 * so a refused capture leaves no stub names behind.
 */
async function fileSource(deps: SaveCaptureDeps, parsed: ParsedCapture): Promise<Filed> {
  const sources = deps.sources;
  if (!sources) throw new Error("filing a source needs the sources repo");
  const url = parsed.urls.find((u) => sources.parseLink(u) !== null);
  if (!url) throw new NoSourceLinkError();
  const companies = await resolveCompanies(deps.catalog, parsed.symbols);
  const themes = await resolveConcepts(deps.catalog, parsed.themes);
  const saved = await sources.save({ url, note: parsed.body.replace(url, "").trim(), companyIds: companies.map((c) => c.id), themeIds: themes.map((t) => t.id) });
  return { itemId: null, company: companies[0] ?? null, theme: themes[0] ?? null, themes, sourceAnswer: saved.answer, ...(saved.duplicate ? {} : { sourceReadId: saved.id }) };
}

export async function fileCapture(deps: SaveCaptureDeps, parsed: ParsedCapture): Promise<Filed> {
  if (parsed.kind === "source" || (parsed.kind === "video" && !deps.videos && deps.sources)) return fileSource(deps, parsed);
  if (parsed.kind === "video") return fileVideo(deps, parsed);
  const company = await firstResolved(parsed.symbols, (s) => ensureCompany(deps.catalog, s));
  const themes = await resolveConcepts(deps.catalog, parsed.themes);
  const theme = themes[0] ?? null;
  const conceptIds = themes.length > 0 ? themes.map((t) => t.id) : null;
  if (parsed.kind === "thesis" && company) {
    const existing = await deps.research.findThesisForCompany(company.id);
    if (existing) {
      const changeReason = clipUnits(parsed.firstLine, REASON_MAX).trim() || null;
      await appendRevision(deps.research, { itemId: existing.id, appendMd: parsed.body, changeReason, conceptIds });
      return { itemId: existing.id, company, theme, themes };
    }
  }
  const title = parsed.kind === "thesis" && company ? `${company.nseSymbol ?? company.name} thesis` : parsed.title;
  const { item } = await createItem(deps.research, {
    kind: parsed.kind,
    title,
    bodyMd: parsed.body,
    companyId: company?.id ?? null,
    themeId: theme?.id ?? null,
    conceptIds,
  });
  return { itemId: item.id, company, theme, themes };
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
    if (!(error instanceof NotYoutubeLinkError) && !(error instanceof NoSourceLinkError)) console.error("capture filing failed", errorShapeText(error));
    const code: FilingErrorCode = error instanceof NotYoutubeLinkError
      ? "not-youtube-link"
      : error instanceof NoSourceLinkError
        ? "no-source-link"
        : isSourceNoteFull(error)
          ? "source-note-full"
          : bodyTooLong(error)
            ? "thesis-full"
            : "filing-failed";
    try {
      await deps.captures.attach(capture.id, { parsed: { ...parsed, error: code, errorDetail: errorShapeText(error) } });
    } catch {
      // The raw text is already stored; the failure marker is a convenience, not the record.
    }
    return { captureId: capture.id, itemId: null, kind: parsed.kind, duplicate: false, parseError: code };
  }

  try {
    await deps.captures.attach(capture.id, {
      // A source is recorded as one even when it came in as a v: (the desk's streak does not count sources).
      parsed: filed.sourceAnswer === undefined ? { ...parsed } : { ...parsed, kind: "source" },
      itemId: filed.itemId,
      companyId: filed.company?.id ?? null,
      themeId: filed.theme?.id ?? null,
    });
  } catch (error) {
    // The item exists; only the back-link is missing. Report the item so the UI does not offer a re-file.
    console.error("capture link failed", errorShapeText(error));
    return { captureId: capture.id, itemId: filed.itemId, kind: parsed.kind, duplicate: false, parseError: "link-failed" };
  }
  const kind: CaptureKind = filed.sourceAnswer === undefined ? parsed.kind : "source";
  return { captureId: capture.id, itemId: filed.itemId, kind, duplicate: false, parseError: null, ...(filed.sourceAnswer === undefined ? {} : { sourceAnswer: filed.sourceAnswer }), ...(filed.sourceReadId === undefined ? {} : { sourceReadId: filed.sourceReadId }) };
}
