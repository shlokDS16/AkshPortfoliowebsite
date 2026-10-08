// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { IMAGE_MAX_BYTES } from "@/modules/documents/client";
import { downscaleImage, fitWithin, PHOTO_UNREADABLE, type CanvasLike, type ImageEnv } from "./downscale";

// jsdom has no canvas: the environment is a mock that records what was drawn and sizes each encoded blob from its quality.

function env(width: number, height: number, bytesAt: (quality: number) => number) {
  const qualities: number[] = [];
  const drawn: { w: number; h: number }[] = [];
  const canvas: CanvasLike = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: "", fillRect: () => {}, drawImage: (_i, _x, _y, w, h) => void drawn.push({ w, h }) }),
    toBlob(done, type, quality) {
      qualities.push(quality);
      expect(type).toBe("image/jpeg");
      done(new Blob([new Uint8Array(bytesAt(quality))], { type }));
    },
  };
  const close = vi.fn();
  const image: ImageEnv = { decode: async () => ({ width, height, close }), canvas: () => canvas };
  return { image, canvas, qualities, drawn, close };
}
const photo = (name = "IMG_0042.png") => new File(["x"], name, { type: "image/png" });

describe("fitWithin", () => {
  it("keeps the proportions, fits the long side and never enlarges", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10_000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe("downscaleImage", () => {
  it("draws the photo on a canvas of at most 1,600 px with the same proportions", async () => {
    const e = env(4032, 3024, () => 200_000);
    const out = await downscaleImage(photo(), e.image);
    expect(out.ok).toBe(true);
    expect([e.canvas.width, e.canvas.height]).toEqual([1600, 1200]);
    expect(e.drawn).toEqual([{ w: 1600, h: 1200 }]);
    expect(e.canvas.width / e.canvas.height).toBeCloseTo(4032 / 3024, 2);
    expect(e.close).toHaveBeenCalled();
  });

  it("returns a JPEG file named after the photo, under 1 MB, at the first quality that fits", async () => {
    const e = env(2000, 1000, () => 400_000);
    const out = await downscaleImage(photo("Q2 table.PNG"), e.image);
    if (!out.ok) throw new Error("expected a file");
    expect(out.file.type).toBe("image/jpeg");
    expect(out.file.name).toBe("Q2 table.jpg");
    expect(out.file.size).toBeLessThanOrEqual(IMAGE_MAX_BYTES);
    expect(e.qualities).toEqual([0.85]);
  });

  it("steps the quality down from 0.85 to 0.6 until the file is under 1 MB", async () => {
    const e = env(1600, 1200, (q) => Math.round(1_500_000 * q)); // 0.65 is the first that fits (975,000)
    const out = await downscaleImage(photo(), e.image);
    expect(out.ok).toBe(true);
    expect(e.qualities).toEqual([0.85, 0.8, 0.75, 0.7, 0.65]);
    if (out.ok) expect(out.file.size).toBe(975_000);
  });

  it("refuses a photo that is still over 1 MB at quality 0.6, and says to crop", async () => {
    const e = env(1600, 1200, () => IMAGE_MAX_BYTES + 1);
    const out = await downscaleImage(photo(), e.image);
    expect(out).toEqual({ ok: false, message: "This photo is still over 1 MB after shrinking; crop it to the table." });
    expect(e.qualities).toEqual([0.85, 0.8, 0.75, 0.7, 0.65, 0.6]);
  });

  it("a file the browser cannot decode is refused with the unsupported sentence", async () => {
    const broken: ImageEnv = { decode: async () => Promise.reject(new Error("bad image")), canvas: () => env(1, 1, () => 1).canvas };
    expect(await downscaleImage(photo(), broken)).toEqual({ ok: false, message: PHOTO_UNREADABLE });
  });
});
