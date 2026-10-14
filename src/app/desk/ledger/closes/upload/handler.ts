import type { AdminIdentity } from "@/modules/identity";
import { UPLOAD_LIMITS, type UploadResult } from "@/modules/ledger/client";

// The Closes page's "drop NSE's official file" route, as a plain POST (not a server action: the body is a file, and an action
// cannot cap it as it is read). It parses a file a browser sent, so the order is fixed and each step refuses before the next
// one costs anything:
//   1. the admin session, first; no session is a 401 and nothing is read (a fetch cannot follow a redirect to a sign-in page);
//   2. the Origin must be this site's (a page on another site cannot send the owner's cookies here);
//   3. Content-Length, when it is there, against the limit, before one byte of the body is read;
//   4. the body is read through a counter that stops at the limit whatever Content-Length said (it may be absent or false);
//   5. only then is the form taken apart, and each file checked against its own limit;
//   6. the files go to the upload function as bytes. Nothing is written to disk and the file is not kept.
// The answer is JSON with a closed code; no parser message and no file content is ever sent back.

export type UploadRouteDeps = {
  /** The signed-in admin, or null. No redirect. */
  getAdmin: () => Promise<AdminIdentity | null>;
  /** NEXT_PUBLIC_SITE_URL. */
  siteUrl: () => string;
  upload: (input: { date: string; zip: Uint8Array; index: Uint8Array | null }) => Promise<UploadResult>;
};

const FIELDS = new Set(["date", "bhavcopy", "index"]);

const answer = (body: object, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const refusal = (code: Extract<UploadResult, { ok: false }>["code"], status: number) => answer({ ok: false, code }, status);

/** Reads a request body up to `max` bytes, counting what actually arrives; `null` as soon as it goes over (the stream is cancelled). */
export async function readBodyCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

async function fileBytes(value: FormDataEntryValue | null, max: number): Promise<Uint8Array | null | "too_large" | "not_a_file"> {
  if (value === null) return null;
  if (typeof value === "string") return value === "" ? null : "not_a_file";
  if (value.size > max) return "too_large";
  const bytes = new Uint8Array(await value.arrayBuffer());
  return bytes.byteLength === 0 ? null : bytes;
}

export function createUploadHandler(deps: UploadRouteDeps) {
  return async function POST(request: Request): Promise<Response> {
    if (!(await deps.getAdmin())) return answer({ ok: false, error: "not-signed-in" }, 401);

    const origin = request.headers.get("origin");
    if (origin === null || ![new URL(deps.siteUrl()).origin, new URL(request.url).origin].includes(origin)) return refusal("forbidden", 403);

    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^\d{1,12}$/.test(declared) || Number(declared) > UPLOAD_LIMITS.bodyBytes)) return refusal("too_large", 413);
    const type = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(type)) return refusal("not_a_form", 415);

    const bytes = await readBodyCapped(request.body, UPLOAD_LIMITS.bodyBytes).catch(() => undefined);
    if (bytes === null) return refusal("too_large", 413);
    if (bytes === undefined) return refusal("not_a_form", 400);

    let form: FormData;
    try {
      form = await new Response(bytes as unknown as BodyInit, { headers: { "content-type": type } }).formData();
    } catch {
      return refusal("not_a_form", 400);
    }
    const keys = [...form.keys()];
    if (keys.some((k) => !FIELDS.has(k)) || new Set(keys).size !== keys.length) return refusal("not_a_form", 400);

    const date = form.get("date");
    if (typeof date !== "string") return refusal("bad_date", 422);
    const zip = await fileBytes(form.get("bhavcopy"), UPLOAD_LIMITS.zipBytes);
    if (zip === "too_large") return refusal("too_large", 413);
    if (zip === "not_a_file") return refusal("not_a_form", 400);
    if (zip === null) return refusal("missing_zip", 422);
    const index = await fileBytes(form.get("index"), UPLOAD_LIMITS.indexBytes);
    if (index === "too_large") return refusal("too_large", 413);
    if (index === "not_a_file") return refusal("not_a_form", 400);

    try {
      const result = await deps.upload({ date, zip, index });
      return answer(result, result.ok ? 200 : 422);
    } catch (error) {
      // Name only: a database message or a file value must never reach a log or the page.
      console.error("ledger upload failed", error instanceof Error ? error.name : typeof error);
      return refusal("store_failed", 500);
    }
  };
}
