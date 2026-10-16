import { describe, expect, it, vi } from "vitest";
import { MAX_PICTURE_BYTES, serveStudiedPicture } from "./studied-media";

// Phase 5d (spec s7): /media/studied/<64 hex>.jpg. The bucket is private; the database lets anon read an object only while a public entry shows it.

const SHA = "c".repeat(64);
const jpeg = (size = 600) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
};
const readable = (bytes: Uint8Array) => vi.fn(async (path: string) => (path === `yt/${SHA}.jpg` ? { bytes } : null));

describe("serveStudiedPicture", () => {
  it("serves a readable picture as a JPEG, cached an hour with no stale window, never sniffed", async () => {
    const bytes = jpeg();
    const download = readable(bytes);
    const res = await serveStudiedPicture(`${SHA}.jpg`, { download });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=3600");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-length")).toBe(String(bytes.length));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(download).toHaveBeenCalledExactlyOnceWith(`yt/${SHA}.jpg`);
  });

  it.each([
    ["no extension", SHA],
    ["a png", `${SHA}.png`],
    ["upper-case hex", `${SHA.toUpperCase()}.jpg`],
    ["63 characters", `${SHA.slice(1)}.jpg`],
    ["65 characters", `${SHA}0.jpg`],
    ["a path", `../${SHA}.jpg`],
    ["an encoded path", `..%2F${SHA}.jpg`],
    ["a folder", `yt/${SHA}.jpg`],
    ["a double extension", `${SHA}.jpg.jpg`],
    ["a trailing space", `${SHA}.jpg `],
    ["a newline", `${SHA}.jpg\n`],
    ["empty", ""],
  ])("answers 404 without asking storage for %s", async (_name, file) => {
    const download = readable(jpeg());
    const res = await serveStudiedPicture(file, { download });
    expect(res.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("answers 404 for a picture anon cannot read (not shown, private, or not there), the same for all three", async () => {
    const res = await serveStudiedPicture(`${"d".repeat(64)}.jpg`, { download: readable(jpeg()) });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 404 and does not throw when storage fails", async () => {
    const res = await serveStudiedPicture(`${SHA}.jpg`, { download: async () => Promise.reject(new Error("boom")) });
    expect(res.status).toBe(404);
  });

  it("refuses bytes that are not a JPEG and bytes over 200 KB, though the bucket should have stopped both", async () => {
    const png = new Uint8Array(600);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    expect((await serveStudiedPicture(`${SHA}.jpg`, { download: readable(png) })).status).toBe(404);
    expect((await serveStudiedPicture(`${SHA}.jpg`, { download: readable(jpeg(MAX_PICTURE_BYTES + 1)) })).status).toBe(404);
    expect((await serveStudiedPicture(`${SHA}.jpg`, { download: readable(jpeg(MAX_PICTURE_BYTES)) })).status).toBe(200);
    expect(MAX_PICTURE_BYTES).toBe(204_800);
  });
});
