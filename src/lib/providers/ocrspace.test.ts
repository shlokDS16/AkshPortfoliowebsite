import { describe, expect, it, vi } from "vitest";
import { createOcrSpace, OCRSPACE_URL, redact } from "./ocrspace";

const KEY = "K81234567888957";
const MAX = 1_048_576;
const PDF = { bytes: new TextEncoder().encode("%PDF-1.4 page"), filetype: "PDF" as const };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answer = (text: string) => json({ OCRExitCode: 1, IsErroredOnProcessing: false, ParsedResults: [{ ParsedText: text, FileParseExitCode: 1 }] });
const errored = (message: string | string[]) => json({ OCRExitCode: 99, IsErroredOnProcessing: true, ErrorMessage: message, ParsedResults: null });

function port(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, maxBytes = MAX) {
  return createOcrSpace({ apiKey: KEY, maxBytes, fetch: fetchImpl as unknown as typeof fetch });
}
const sent = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls[0] as unknown as [string, RequestInit];

describe("OCR.space adapter", () => {
  it("posts the file as multipart with the key in the apikey header, Engine 2, scaling and the table switch", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => answer("Revenue 1,284.00"));
    const result = await port(fetchSpy).read(PDF, { table: true });
    expect(result).toEqual({ kind: "ok", text: "Revenue 1,284.00" });
    const [url, init] = sent(fetchSpy);
    expect(url).toBe(OCRSPACE_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ apikey: KEY });
    const form = init.body as FormData;
    expect(form.get("filetype")).toBe("PDF");
    expect(form.get("isTable")).toBe("true");
    expect(form.get("OCREngine")).toBe("2");
    expect(form.get("scale")).toBe("true");
    expect(form.get("apikey")).toBeNull(); // header only
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("asks for plain text when the page is not a table", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => answer("x"));
    await port(fetchSpy).read(PDF, { table: false });
    expect((sent(fetchSpy)[1].body as FormData).get("isTable")).toBe("false");
  });

  it("joins the parsed pages, turns CRLF into line breaks and drops NUL", async () => {
    const body = json({ IsErroredOnProcessing: false, ParsedResults: [{ ParsedText: "Line one\r\nLine\u0000 two\r\n" }, { ParsedText: "Page two" }] });
    expect(await port(async () => body).read(PDF, { table: true })).toEqual({ kind: "ok", text: "Line one\nLine two\n\nPage two" });
  });

  it("an answer without parsed results is an empty text, not an error", async () => {
    const body = json({ IsErroredOnProcessing: false, ParsedResults: [] });
    expect(await port(async () => body).read(PDF, { table: true })).toEqual({ kind: "ok", text: "" });
  });

  it.each([
    ["You may only perform this action upto maximum 500 times in 86400 seconds."],
    ["Daily request limit exceeded for this IP address."],
    [["The monthly quota for this key is used up."]],
  ])("a quota message (%j) is refused for the day, not a failure", async (message) => {
    const r = await port(async () => errored(message)).read(PDF, { table: true });
    expect(r).toMatchObject({ kind: "refused", reason: "day" });
  });

  it("HTTP 403 and 429 are refused for the day", async () => {
    expect(await port(async () => new Response("Forbidden", { status: 403 })).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "day" });
    expect(await port(async () => new Response("Too many", { status: 429 })).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "day" });
  });

  it("an answer that names a bad key is refused as a key problem, never as a daily defer", async () => {
    expect(await port(async () => errored("Invalid API key")).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "key" });
    expect(await port(async () => new Response("The API key is not valid", { status: 403 })).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "key" });
    expect(await port(async () => new Response("no", { status: 401 })).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "key" });
  });

  it("a file the provider calls too big, or a PDF with too many pages, is refused for its size or pages", async () => {
    expect(await port(async () => errored("File size exceeds the maximum permissible file size limit of 1024 KB")).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "size" });
    expect(await port(async () => new Response("x", { status: 413 })).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "size" });
    expect(await port(async () => errored("PDF page limit exceeded: only 3 pages are processed")).read(PDF, { table: true })).toMatchObject({ kind: "refused", reason: "pages" });
  });

  it("refuses a file over the cap locally, without a request", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => answer("never"));
    const big = { bytes: new Uint8Array(1_200_000), filetype: "PDF" as const };
    const r = await port(fetchSpy).read(big, { table: true });
    expect(r).toMatchObject({ kind: "refused", reason: "size" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a network error or a timeout is a provider error that carries no key and no file text", async () => {
    const r = await port(async () => {
      throw new TypeError(`fetch failed for ${KEY}`);
    }).read(PDF, { table: true });
    expect(r).toEqual({ kind: "provider_error", message: "TypeError" });
    expect(JSON.stringify(r)).not.toContain(KEY);
    const t = await port(async () => {
      throw new DOMException("timed out", "TimeoutError");
    }).read(PDF, { table: true });
    expect(t).toMatchObject({ kind: "provider_error", message: "TimeoutError" });
  });

  it("any other failing status or an unreadable answer is a provider error", async () => {
    expect(await port(async () => new Response("oops", { status: 500 })).read(PDF, { table: true })).toEqual({ kind: "provider_error", message: "HTTP 500" });
    expect(await port(async () => new Response("<html>", { status: 200 })).read(PDF, { table: true })).toMatchObject({ kind: "provider_error" });
    expect(await port(async () => errored("Unable to recognize the file type")).read(PDF, { table: true })).toMatchObject({ kind: "provider_error" });
  });

  it("gives the request a timeout signal, shortened by the caller near a deadline", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => answer("x"));
    await port(fetchSpy).read(PDF, { table: true, timeoutMs: 5_000 });
    expect(sent(fetchSpy)[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("never follows a redirect: the key rides in a header and must not reach another origin", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => answer("x"));
    await port(fetchSpy).read(PDF, { table: true });
    expect(sent(fetchSpy)[1].redirect).toBe("error");
    // The platform then throws on a redirect, and that is a provider error with no URL in it.
    const r = await port(async () => {
      throw new TypeError("fetch failed: unexpected redirect to https://elsewhere.example/?apikey=" + KEY);
    }).read(PDF, { table: true });
    expect(r).toEqual({ kind: "provider_error", message: "TypeError" });
  });

  it("redacts the key and anything key-shaped from a provider message before it leaves the adapter", async () => {
    const echoed = `Error for apikey: ${KEY} and token a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 (file scan_2026.pdf)`;
    const r = await port(async () => errored(echoed)).read(PDF, { table: true });
    expect(r.kind).toBe("provider_error");
    const message = (r as { message: string }).message;
    expect(message).not.toContain(KEY);
    expect(message).not.toContain("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6");
    expect(message).not.toMatch(/apikey: /i);
    expect(message).toContain("scan_2026.pdf"); // an ordinary file name is not a secret
    // A quota answer that quotes the key is still told as a quota, and carries no key.
    const quota = await port(async () => errored(`Key ${KEY}: You may only perform this action upto maximum 500 times in 86400 seconds.`)).read(PDF, { table: true });
    expect(quota).toMatchObject({ kind: "refused", reason: "day" });
    expect(JSON.stringify(quota)).not.toContain(KEY);
  });
});

describe("redaction before truncation", () => {
  it("a key that straddles the 300-character cut leaves no fragment", async () => {
    const key = "K81234567888957";
    // The key starts 8 characters before the cut: a cut-then-redact order would keep its first 8 characters.
    const filler = "x ".repeat(146); // 292 characters
    const message = `${filler}${key} and more text after the key`;
    const r = await createOcrSpace({ apiKey: key, maxBytes: MAX, fetch: (async () => errored(message)) as unknown as typeof fetch }).read(PDF, { table: true });
    const text = (r as { message: string }).message;
    expect(text).not.toContain(key.slice(0, 6));
    expect(text).not.toContain(key.slice(-6));
    expect(text.length).toBeLessThanOrEqual(300);
  });
});

describe("redact", () => {
  it("removes the exact key, apikey assignments and long mixed tokens, and leaves words and numbers", () => {
    expect(redact(`bad ${KEY} here`, KEY)).toBe("bad [removed] here");
    expect(redact("apikey=abc", "other")).toBe("apikey [removed]");
    expect(redact("a-very-long-hyphenated-sentence-without-digits", "k")).toBe("a-very-long-hyphenated-sentence-without-digits");
    expect(redact("Maximum 500 times in 86400 seconds; 1024 KB limit.", "k")).toBe("Maximum 500 times in 86400 seconds; 1024 KB limit.");
    expect(redact("nothing here", "")).toBe("nothing here");
  });
});
