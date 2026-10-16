import { beforeEach, describe, expect, it, vi } from "vitest";

const download = vi.fn();
const from = vi.fn(() => ({ download }));
const client = { storage: { from } };
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: () => client }));

const { GET } = await import("./route");
const SHA = "e".repeat(64);
const ask = (file: string) => GET(new Request(`https://site.test/media/studied/${file}`), { params: Promise.resolve({ file }) });

describe("GET /media/studied/[file]", () => {
  beforeEach(() => {
    download.mockReset();
    from.mockClear();
  });

  it("reads the private bucket with the cookie-less anon client and serves the bytes", async () => {
    download.mockResolvedValue({ data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3])]), error: null });
    const res = await ask(`${SHA}.jpg`);
    expect(from).toHaveBeenCalledExactlyOnceWith("source-thumbs");
    expect(download).toHaveBeenCalledExactlyOnceWith(`yt/${SHA}.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("is a 404 when storage says the object is not readable", async () => {
    download.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    expect((await ask(`${SHA}.jpg`)).status).toBe(404);
  });

  it("is a 404 for a bad name and never opens storage", async () => {
    expect((await ask("evil.jpg")).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });
});
