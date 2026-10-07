// Browser-safe entry point (the upload bar and the storage meter). No server-only imports here.
export * from "./limits";
export type { Basis, DocSourceType, DocumentListItem, DocumentRow, DocumentStatus, PageKind, PageRow, StartUploadInput } from "./types";
export { normaliseText, onPage, parsePrinted, queryWords } from "./verbatim";

/** Lower-case hex SHA-256 of a file, computed in the browser before upload (the server dedupes on it). */
export async function hashFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
