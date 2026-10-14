import { beforeEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_LIMITS, type UploadResult } from "@/modules/ledger/client";
import { createUploadHandler, readBodyCapped } from "./handler";

const SITE = "https://desk.example.com";
const URL_ = `${SITE}/desk/ledger/closes/upload`;
const admin = { userId: "u-1", email: "aksh@example.com" };
const getAdmin = vi.fn();
const upload = vi.fn<(input: { date: string; zip: Uint8Array; index: Uint8Array | null; adminId: string }) => Promise<UploadResult>>();
const OK: UploadResult = { ok: true, tradeDate: "2026-10-12", stored: 2, kept: 0, tracked: 2, indexStored: true, scored: 2 };

const handler = () => createUploadHandler({ getAdmin, siteUrl: () => `${SITE}/`, upload });
const file = (bytes: Uint8Array | string, name = "x.bin", type = "application/octet-stream") => new File([bytes as BlobPart], name, { type });
const form = (fields: Record<string, string | File | undefined>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.append(key, value);
  return data;
};
const post = (body: FormData | BodyInit | null, headers: HeadersInit = { origin: SITE }, url = URL_) =>
  handler()(new Request(url, { method: "POST", body, headers }));
const good = () => form({ date: "2026-10-12", bhavcopy: file(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]), "BhavCopy.csv.zip", "application/zip"), index: file("a,b\n1,2\n", "ind.csv", "text/csv") });

beforeEach(() => {
  getAdmin.mockReset().mockResolvedValue(admin);
  upload.mockReset().mockResolvedValue(OK);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the owner's official-file route", () => {
  it("hands the bytes of a good form to the upload and answers with its result", async () => {
    const res = await post(good());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK);
    expect(upload).toHaveBeenCalledTimes(1);
    const input = upload.mock.calls[0]![0];
    expect(input.date).toBe("2026-10-12");
    expect(input.adminId).toBe("u-1"); // the checked admin travels with the bytes, for the upload record
    expect([...input.zip]).toEqual([0x50, 0x4b, 3, 4, 1, 2, 3]);
    expect(input.index).not.toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the index file is optional", async () => {
    const res = await post(form({ date: "2026-10-12", bhavcopy: file(new Uint8Array([0x50, 0x4b, 3, 4])) }));
    expect(res.status).toBe(200);
    expect(upload.mock.calls[0]![0].index).toBeNull();
  });

  it("a refusal from the upload is a 422 with its code, and only its code", async () => {
    upload.mockResolvedValue({ ok: false, code: "wrong_date", fileDate: "2026-10-09" });
    const res = await post(good());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, code: "wrong_date", fileDate: "2026-10-09" });
  });

  it("an upload that throws is a 500 'could not store'; the log holds the error's name only", async () => {
    upload.mockRejectedValue(Object.assign(new Error("row ALPHA 1234.50 leaked"), { name: "DbError" }));
    const res = await post(good());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, code: "store_failed" });
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/ALPHA|1234/);
  });
});

describe("the owner is checked first, before anything is read", () => {
  it("no admin session is a 401 and the body is never touched", async () => {
    getAdmin.mockResolvedValue(null);
    let read = false;
    const body = new ReadableStream<Uint8Array>({ pull: (c) => { read = true; c.close(); } }, { highWaterMark: 0 });
    const res = await handler()(new Request(URL_, { method: "POST", body, headers: { origin: SITE, "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as RequestInit));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-signed-in" });
    expect(upload).not.toHaveBeenCalled();
    expect(read).toBe(false);
  });

  it("a request from another site, or with no Origin, is a 403 and stores nothing", async () => {
    const cases: Record<string, string>[] = [{ origin: "https://evil.example" }, {}, { origin: "null" }];
    for (const headers of cases) {
      const res = await post(good(), headers);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, code: "forbidden" });
    }
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts the origin the request itself arrived on (a preview address)", async () => {
    const preview = "https://desk-git-x.vercel.app";
    expect((await post(good(), { origin: preview }, `${preview}/desk/ledger/closes/upload`)).status).toBe(200);
  });
});

describe("the size is enforced before and while reading, and stated", () => {
  it("states the limits", () => {
    expect(UPLOAD_LIMITS).toMatchObject({ bodyBytes: 2_621_440, zipBytes: 2_097_152, indexBytes: 524_288 });
  });

  it("a Content-Length over the limit is refused before one byte is read", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull: (c) => { pulls += 1; c.enqueue(new Uint8Array(10)); c.close(); } }, { highWaterMark: 0 });
    const res = await handler()(
      new Request(URL_, { method: "POST", body, duplex: "half", headers: { origin: SITE, "content-type": "multipart/form-data; boundary=x", "content-length": String(UPLOAD_LIMITS.bodyBytes + 1) } } as RequestInit),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, code: "too_large" });
    expect(pulls).toBe(0);
  });

  it("a body that goes over the limit while arriving (no Content-Length, or a false one) is cut off and refused", async () => {
    let sent = 0;
    const chunk = new Uint8Array(512 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent > UPLOAD_LIMITS.bodyBytes * 4) controller.close();
      },
    });
    const res = await handler()(
      new Request(URL_, { method: "POST", body, duplex: "half", headers: { origin: SITE, "content-type": "multipart/form-data; boundary=x", "content-length": "100" } } as RequestInit),
    );
    expect(res.status).toBe(413);
    // The stream was cancelled soon after the limit, not drained.
    expect(sent).toBeLessThanOrEqual(UPLOAD_LIMITS.bodyBytes + 3 * chunk.byteLength);
    expect(upload).not.toHaveBeenCalled();
  });

  it("a zip field over its own limit is refused even when the whole request fits", async () => {
    const over = new Uint8Array(UPLOAD_LIMITS.zipBytes + 1);
    over.set([0x50, 0x4b, 3, 4]);
    // 2 MB + 1 fits in the 2.5 MB request, so only the field's own limit stops it.
    const res = await post(form({ date: "2026-10-12", bhavcopy: file(over) }));
    expect(res.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it("an index field over its own limit", async () => {
    const res = await post(form({ date: "2026-10-12", bhavcopy: file(new Uint8Array([0x50, 0x4b, 3, 4])), index: file(new Uint8Array(UPLOAD_LIMITS.indexBytes + 1)) }));
    expect(res.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it("readBodyCapped counts the bytes that arrive, and gives the whole body when it fits", async () => {
    const body = (n: number) => new Blob([new Uint8Array(n)]).stream() as ReadableStream<Uint8Array>;
    expect((await readBodyCapped(body(100), 100))?.byteLength).toBe(100);
    expect(await readBodyCapped(body(101), 100)).toBeNull();
    expect((await readBodyCapped(null, 100))?.byteLength).toBe(0);
  });
});

describe("a body that is not the form", () => {
  const withType = (body: BodyInit, type: string) => post(body, { origin: SITE, "content-type": type });

  it("is refused as not a form: wrong content type, no boundary, broken multipart, empty body", async () => {
    for (const [body, type] of [
      [JSON.stringify({ date: "2026-10-12" }), "application/json"],
      ["date=2026-10-12", "application/x-www-form-urlencoded"],
      ["x", "multipart/form-data"],
      ["--b\r\nbroken", "multipart/form-data; boundary=b"],
      ["", "multipart/form-data; boundary=b"],
    ] as const) {
      const res = await withType(body, type);
      expect([400, 415], type).toContain(res.status);
      expect((await res.json()).code, type).toBe("not_a_form");
    }
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses a field it does not know, a repeated field, and a file where text belongs", async () => {
    const extra = good();
    extra.append("note", "hello");
    expect((await (await post(extra)).json()).code).toBe("not_a_form");
    const twice = good();
    twice.append("date", "2026-10-11");
    expect((await (await post(twice)).json()).code).toBe("not_a_form");
    const textInFileSlot = form({ date: "2026-10-12", bhavcopy: "PK" });
    expect((await (await post(textInFileSlot)).json()).code).toBe("not_a_form");
    expect(upload).not.toHaveBeenCalled();
  });

  it("no date and no zip are plain refusals", async () => {
    expect((await (await post(form({ bhavcopy: file(new Uint8Array([0x50, 0x4b, 3, 4])) }))).json()).code).toBe("bad_date");
    expect((await (await post(form({ date: "2026-10-12" }))).json()).code).toBe("missing_zip");
    expect((await (await post(form({ date: "2026-10-12", bhavcopy: file(new Uint8Array(0)) }))).json()).code).toBe("missing_zip");
    expect(upload).not.toHaveBeenCalled();
  });

  it("never trusts the file's name or declared type: the bytes go on whatever they are called", async () => {
    await post(form({ date: "2026-10-12", bhavcopy: file("not a zip at all", "totally-a-zip.zip", "application/zip") }));
    expect(upload).toHaveBeenCalledTimes(1); // sniffing is the upload function's job, on the bytes
  });
});
