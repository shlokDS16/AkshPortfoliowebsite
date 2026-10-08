// The OCR port (ADR-004 s3, Plan 2b Task 2). Types only; the adapters are ocrspace.ts and fixture-ocr.ts.

export type OcrFiletype = "PDF" | "JPG" | "PNG" | "WEBP";

export type OcrResult =
  | { kind: "ok"; text: string }
  /**
   * A quota or a limit, never a crash: `day` is the provider's daily allowance (defer), `size` and `pages` are limits of the
   * file (attention), `key` is a key the provider did not accept (attention, never a daily defer; ruling R9).
   */
  | { kind: "refused"; reason: "day" | "size" | "pages" | "key"; message: string }
  | { kind: "provider_error"; message: string };

export interface OcrPort {
  readonly name: "ocrspace" | "fixture";
  /** `table` is true for statement pages: the provider then returns the text line by line. `timeoutMs` shortens the call near a deadline. */
  read(file: { bytes: Uint8Array; filetype: OcrFiletype }, opts: { table: boolean; timeoutMs?: number }): Promise<OcrResult>;
}
