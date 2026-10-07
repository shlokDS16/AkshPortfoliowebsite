import type { FilingErrorCode } from "./messages";

export const CAPTURE_SOURCES = ["web", "mobile", "api"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export type CaptureRecord = {
  id: string;
  rawText: string;
  parsed: Record<string, unknown> | null;
  itemId: string | null;
  companyId: string | null;
  themeId: string | null;
  source: CaptureSource;
  clientId: string | null;
  createdAt: string;
};

export type CaptureListEntry = {
  id: string;
  rawText: string;
  createdAt: string;
  itemId: string | null;
  companyId: string | null;
  companySymbol: string | null;
  companyName: string | null;
  parseError: FilingErrorCode | null;
  /** No parse was ever recorded: a function killed mid-filing, or a lost link. */
  parsedMissing: boolean;
};

export type CaptureAttachment = {
  parsed: Record<string, unknown>;
  itemId?: string | null;
  companyId?: string | null;
  themeId?: string | null;
};

export interface CaptureRepo {
  findByClientId(clientId: string): Promise<CaptureRecord | null>;
  findById(id: string): Promise<CaptureRecord | null>;
  insertRaw(input: { rawText: string; source: CaptureSource; clientId: string }): Promise<CaptureRecord>;
  attach(id: string, patch: CaptureAttachment): Promise<void>;
  listSince(sinceIso: string): Promise<CaptureListEntry[]>;
}
