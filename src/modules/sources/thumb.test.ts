import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { deskThumbnail } from "./thumb";

// The desk's own route for a saved source's picture: the admin session reads the private bucket; a browser never contacts the picture's origin.

const ID = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function fakeDb(row: { thumb_path: string | null } | null, download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>) {
  const asked: string[] = [];
  const from = vi.fn(() => ({ select: (columns: string) => (asked.push(columns), { eq: (c: string, v: string) => (asked.push(`${c}=${v}`), { maybeSingle: async () => ({ data: row, error: null }) }) }) }));
  const storageFrom = vi.fn(() => ({ download }));
  return { db: { from, storage: { from: storageFrom } } as unknown as Db, asked, from, storageFrom };
}

describe("deskThumbnail", () => {
  it("reads the link's own picture path, then that object from the private bucket", async () => {
    const download = vi.fn(async () => ({ data: new Blob([JPEG]), error: null }));
    const { db, asked, from, storageFrom } = fakeDb({ thumb_path: `yt/${"a".repeat(64)}.jpg` }, download);
    const bytes = await deskThumbnail(db, ID);
    expect(bytes).toEqual(JPEG);
    expect(from).toHaveBeenCalledWith("source_links");
    expect(asked).toEqual(["thumb_path", `id=${ID}`]);
    expect(storageFrom).toHaveBeenCalledWith("source-thumbs");
    expect(download).toHaveBeenCalledWith(`yt/${"a".repeat(64)}.jpg`);
  });

  it("is null for a link with no picture, for no such link, and for a failed download", async () => {
    expect(await deskThumbnail(fakeDb({ thumb_path: null }, vi.fn()).db, ID)).toBeNull();
    expect(await deskThumbnail(fakeDb(null, vi.fn()).db, ID)).toBeNull();
    expect(await deskThumbnail(fakeDb({ thumb_path: "yt/x.jpg" }, async () => ({ data: null, error: { message: "gone" } })).db, ID)).toBeNull();
  });

  it("is null for bytes that are not a JPEG, and never reads storage for an id that is not a UUID", async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]);
    expect(await deskThumbnail(fakeDb({ thumb_path: "yt/x.jpg" }, async () => ({ data: png, error: null })).db, ID)).toBeNull();
    const { db, from } = fakeDb({ thumb_path: "yt/x.jpg" }, vi.fn());
    expect(await deskThumbnail(db, "../../etc")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
