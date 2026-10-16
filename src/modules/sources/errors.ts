import { DeskError } from "@/lib/errors";
import { SOURCE_ERROR_TEXT, type SourceErrorCode } from "@/lib/messages-sources";
import { dbError } from "@/lib/supabase/errors";

export { SOURCE_ERROR_TEXT, type SourceErrorCode };

/** A refusal with a fixed code; its message is the fixed text and never carries data (not a link, not a title). */
export class SourceError extends DeskError {
  readonly code: SourceErrorCode;
  constructor(code: SourceErrorCode) {
    super(SOURCE_ERROR_TEXT[code]);
    this.code = code;
    this.name = "SourceError";
  }
}

// The database's own sentences (migration 0026) for a refusal with SQLSTATE 23514, as codes.
const REFUSALS: ReadonlyMap<string, SourceErrorCode> = new Map<string, SourceErrorCode>([
  [SOURCE_ERROR_TEXT["source-on-public-file"], "source-on-public-file"],
  [SOURCE_ERROR_TEXT["source-too-many-companies"], "source-too-many-companies"],
  [SOURCE_ERROR_TEXT["source-too-many-concepts"], "source-too-many-concepts"],
]);

/** The error for a failed call: one of the database's fixed refusals becomes its SourceError; anything else stays a DbError (logs only). */
export function sourceDbError(op: string, error: { message: string; code?: string }): Error {
  const code = error.code === "23514" ? REFUSALS.get(error.message) : undefined;
  return code ? new SourceError(code) : dbError(op, error);
}
