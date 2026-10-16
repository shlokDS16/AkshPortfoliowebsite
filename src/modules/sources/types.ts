// Browser-safe shapes of the sources module (no server-only import).

export const PROBLEM_CODES = ["not_found", "not_embeddable", "not_page", "too_big_image", "refused", "timeout", "unavailable", "purged"] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];
export type SourceKind = "youtube" | "web";

/** The most a source can be attached to (migration 0026: the same numbers, enforced there under the link's lock). */
export const MAX_SOURCE_COMPANIES = 5;
export const MAX_SOURCE_CONCEPTS = 8;
/** His private note on a link (source_links.note check). */
export const NOTE_MAX = 4000;
/** A link is read at most this many times when it keeps failing for a reason that may pass (timeout, unavailable). */
export const MAX_READ_ATTEMPTS = 3;

/**
 * One saved link as the desk reads it. `note` is HIS words and never touched by the machine; `title`, `siteName`, `channelUrl`, the
 * picture, the dates and `fetchProblem` are the machine's and are written only by the server's read (record_source_fetch).
 */
export type SourceRecord = {
  id: string;
  url: string;
  kind: SourceKind;
  youtubeId: string | null;
  note: string;
  createdAt: string;
  archivedAt: string | null;
  title: string | null;
  siteName: string | null;
  channelUrl: string | null;
  thumbPath: string | null;
  thumbSha256: string | null;
  metaSha: string | null;
  metaSince: string | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  gone: boolean;
  fetchProblem: ProblemCode | null;
  fetchAttempts: number;
  companyIds: string[];
  themeIds: string[];
};

/** The fields a link carries when it is saved; everything else starts empty. */
export type NewSource = { url: string; urlKey: string; kind: SourceKind; youtubeId: string | null; note: string };

export type SourceFilter = {
  companyId?: string;
  themeId?: string;
  /** Archived links are left out unless this is true. */
  includeArchived?: boolean;
};
