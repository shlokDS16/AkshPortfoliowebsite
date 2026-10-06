/** True for a plain JSON object (not null, not an array, not a primitive). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The object behind a JSON value, or null when it is not one; callers that need an object use `?? {}`. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
