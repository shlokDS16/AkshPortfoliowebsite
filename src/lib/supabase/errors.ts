export class DbError extends Error {
  constructor(
    readonly op: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`${op}: ${message}`);
    this.name = "DbError";
  }
}

export function dbError(op: string, error: { message: string; code?: string }): DbError {
  return new DbError(op, error.code, error.message);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DbError && error.code === "23505";
}
