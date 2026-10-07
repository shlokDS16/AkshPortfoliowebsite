export class DbError extends Error {
  /** `message` null: the text is the operation and code only (job code, whose errors reach heartbeats and steps). */
  constructor(
    readonly op: string,
    readonly code: string | undefined,
    message: string | null,
  ) {
    super(message === null ? `${op} (${code ?? "no code"})` : `${op}: ${message}`);
    this.name = "DbError";
  }
}

export function dbError(op: string, error: { message: string; code?: string }): DbError {
  return new DbError(op, error.code, error.message);
}

/**
 * For job code: a DbError whose text never holds the raw Postgres message, which can quote row values (a page's
 * text, a step's args). Its text reaches a heartbeat's detail and a step's last_error, both readable on the desk.
 */
export function jobDbError(op: string, error: { message: string; code?: string }): DbError {
  return new DbError(op, error.code, null);
}

/** What a heartbeat or a step's last_error may hold about a failure: a DbError's operation and code, else the message. */
export function safeErrorText(error: unknown): string {
  if (error instanceof DbError) return `${error.op} (${error.code ?? "no code"})`;
  return error instanceof Error ? error.message : String(error);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DbError && error.code === "23505";
}
