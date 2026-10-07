// Shared shapes for the desk UI and the modules that feed it (component-inventory "Shared types").
export type ISODate = string; // "2026-06-30"
export type FileNo = string; // "03", never reused

// Mirrors `research/schema.ts:6` (lib cannot import modules); casefile/schema.test.ts asserts equality.
export const HOLDS_POSITION_VALUES = ["yes", "no", "not_disclosed"] as const;
export type HoldsPosition = (typeof HOLDS_POSITION_VALUES)[number];

export const TEST_STATUSES = ["met", "watching", "not_met", "no_data"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];
export type TestCounts = Record<TestStatus, number>;

export const SOURCE_TYPES = ["Annual report", "Presentation", "Filing", "Transcript", "Other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type SourceRef = { id: string; doc: string; locator: string; filedOn?: ISODate; url?: string };
