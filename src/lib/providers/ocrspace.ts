import type { OcrFiletype, OcrPort, OcrResult } from "./ocr";

// The OCR.space adapter (spec s9; https://ocr.space/OCRAPI, read 2026-10-08): POST multipart to /parse/image with the key
// in the `apikey` HEADER, Engine 2, `scale` and `isTable`. Every refusal is a typed result, never a throw, and no
// message carries the key or any of the file's text.

export const OCRSPACE_URL = "https://api.ocr.space/parse/image";
const DEFAULT_TIMEOUT_MS = 30_000;
const MESSAGE_MAX = 300;

const MIME: Record<OcrFiletype, string> = { PDF: "application/pdf", JPG: "image/jpeg", PNG: "image/png", WEBP: "image/webp" };

export type OcrSpaceOptions = {
  apiKey: string;
  /** The file-size cap, from the job runner (the free tier's 1 MB). A bigger file is refused here, with no request. */
  maxBytes: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

const KEY_NAMED = /api\s*-?\s*key|apikey/i;
const KEY_BAD = /invalid|not\s+valid|unknown|missing|wrong|incorrect|unauthori[sz]ed|denied|expired|revoked/i;
const SIZE = /file\s*size|filesize|too\s+large|size\s+limit|1024\s*kb|exceeds? the maximum permissible/i;
const PAGES = /pages?\b[^.]*\b(limit|maximum|exceed|more than|only)|\b(limit|maximum|exceed)[^.]*\bpages?\b/i;
const QUOTA =
  /quota|rate\s*limit|too\s+many|maximum\s+\d+\s+times|upto\s+maximum|times\s+in\s+\d+\s+seconds|(request|usage|daily|monthly|day|month)[^.]*\blimit|limit[^.]*\b(request|usage|day|month)/i;

/** Quota, key, size and page limits are told apart by the provider's words; anything else is a plain provider error. */
function classify(message: string, apiKey: string): OcrResult {
  // Redact first, then cut: a key that straddles the cut would otherwise leave a fragment nothing recognises.
  const text = redact(message, apiKey).slice(0, MESSAGE_MAX);
  if (KEY_NAMED.test(message) && KEY_BAD.test(message) && !QUOTA.test(message)) return { kind: "refused", reason: "key", message: text };
  if (SIZE.test(message)) return { kind: "refused", reason: "size", message: text };
  if (PAGES.test(message)) return { kind: "refused", reason: "pages", message: text };
  if (QUOTA.test(message)) return { kind: "refused", reason: "day", message: text };
  return { kind: "provider_error", message: text };
}

/**
 * A provider message can echo the request (the key, a file name, an address) and it reaches last_error and the desk
 * (Task 2 review). The key goes, and so does anything shaped like one: twelve or more letters, digits, dashes or
 * underscores with at least one digit. Ordinary words, numbers and the quota sentence stay.
 */
export function redact(message: string, apiKey: string): string {
  const withoutKey = apiKey.length > 0 ? message.split(apiKey).join("[removed]") : message;
  return withoutKey
    .replace(/\bapi\s*-?\s*key\s*[:=]\s*\S+/gi, "apikey [removed]")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{12,}\b/g, "[removed]");
}

const clean = (text: string) => text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n");

type Answer = { IsErroredOnProcessing?: unknown; ErrorMessage?: unknown; ParsedResults?: unknown };

function messageOf(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").join(" ");
  return typeof value === "string" ? value : "";
}

function parsedText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const text = (result as { ParsedText?: unknown }).ParsedText;
  return typeof text === "string" ? clean(text) : "";
}

export function createOcrSpace(opts: OcrSpaceOptions): OcrPort {
  const doFetch = opts.fetch ?? fetch;
  /** Every message that leaves the adapter passes through here. */
  const safe = (r: OcrResult): OcrResult => (r.kind === "ok" ? r : { ...r, message: redact(r.message, opts.apiKey) });
  const port = {
    name: "ocrspace" as const,
    async read(file: Parameters<OcrPort["read"]>[0], { table, timeoutMs }: Parameters<OcrPort["read"]>[1]): Promise<OcrResult> {
      if (file.bytes.byteLength > opts.maxBytes) {
        return { kind: "refused", reason: "size", message: "The file is over the scan reader's size limit." };
      }
      const form = new FormData();
      form.append("file", new Blob([file.bytes as BlobPart], { type: MIME[file.filetype] }), `page.${file.filetype.toLowerCase()}`);
      form.append("filetype", file.filetype);
      form.append("isTable", table ? "true" : "false");
      form.append("OCREngine", "2");
      form.append("scale", "true");

      let response: Response;
      try {
        response = await doFetch(OCRSPACE_URL, {
          method: "POST",
          headers: { apikey: opts.apiKey },
          body: form,
          // The key rides in a header: a redirect would carry it to another origin, so none is followed (Task 2 review).
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (error) {
        // The error's name only: its message can echo the request.
        return { kind: "provider_error", message: error instanceof Error ? error.name : "error" };
      }

      if (!response.ok) {
        const status = response.status;
        if (status === 401) return { kind: "refused", reason: "key", message: "HTTP 401" };
        if (status === 413) return { kind: "refused", reason: "size", message: "HTTP 413" };
        if (status === 403 || status === 429) {
          // A 403 is the free plan's quota answer; only a body that names the key as bad changes that.
          const verdict = classify(await response.text().catch(() => ""), opts.apiKey);
          const reason = verdict.kind === "refused" && verdict.reason === "key" ? "key" : "day";
          return { kind: "refused", reason, message: `HTTP ${status}` };
        }
        return { kind: "provider_error", message: `HTTP ${status}` };
      }

      let answer: Answer;
      try {
        answer = (await response.json()) as Answer;
      } catch {
        return { kind: "provider_error", message: "unreadable answer" };
      }
      if (answer.IsErroredOnProcessing === true) {
        return classify(messageOf(answer.ErrorMessage) || "The scan reader reported an error.", opts.apiKey);
      }
      const results = Array.isArray(answer.ParsedResults) ? answer.ParsedResults : [];
      return { kind: "ok", text: results.map(parsedText).join("\n").trim() };
    },
  };
  return { name: port.name, read: async (file, opts2) => safe(await port.read(file, opts2)) };
}
