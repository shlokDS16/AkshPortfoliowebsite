/** Rule c: a source link reaches a page only if it is an http or https address; anything else becomes undefined. */
export function httpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:" ? raw.trim() : undefined;
  } catch {
    return undefined;
  }
}
