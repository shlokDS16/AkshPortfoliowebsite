import { errorText } from "@/lib/messages";
import { IMAGE_LONG_SIDE, IMAGE_MAX_BYTES, IMAGE_QUALITY } from "@/modules/documents/client";

// The browser shrinks a photo before it is sent (Plan 2b Task 3): at most IMAGE_LONG_SIDE pixels on the long side, as a JPEG
// whose quality steps down from 0.85 to 0.6 until it is under 1 MB, the free scan reader's limit. A photo that never fits is
// refused with a sentence that tells Aksh to crop. Pure of the DOM: decoding and the canvas come in through `ImageEnv`.

type Bitmap = { width: number; height: number; close?: () => void };
type Context2d = { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void; drawImage(image: Bitmap, x: number, y: number, w: number, h: number): void };
export type CanvasLike = {
  width: number;
  height: number;
  getContext(id: "2d"): Context2d | null;
  toBlob(done: (blob: Blob | null) => void, type: string, quality: number): void;
};
export type ImageEnv = { decode(file: Blob): Promise<Bitmap>; canvas(): CanvasLike };

export type DownscaleResult = { ok: true; file: File } | { ok: false; message: string };

/** The real browser: createImageBitmap honours the photo's orientation, a canvas draws and encodes it. */
export const browserImageEnv: ImageEnv = {
  decode: (file) => createImageBitmap(file),
  canvas: () => document.createElement("canvas") as unknown as CanvasLike,
};

/** The size that fits `max` pixels on the long side with the same proportions; a smaller image is never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const encode = (canvas: CanvasLike, quality: number) => new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
const jpegName = (name: string) => `${name.replace(/\.[^./\\]+$/, "") || "photo"}.jpg`;
const percent = (fraction: number) => Math.round(fraction * 100);

export async function downscaleImage(file: File, env: ImageEnv = browserImageEnv): Promise<DownscaleResult> {
  const unreadable: DownscaleResult = { ok: false, message: errorText("upload-unsupported") ?? "" };
  let bitmap: Bitmap;
  try {
    bitmap = await env.decode(file);
  } catch {
    return unreadable;
  }
  const size = fitWithin(bitmap.width, bitmap.height, IMAGE_LONG_SIDE);
  const canvas = env.canvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return unreadable;
  // A JPEG has no transparency: a screenshot with a clear background would turn black without this.
  context.fillStyle = "white"; // the JPEG backdrop of the picture sent to the reader, not a screen colour
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close?.();

  // Whole percent steps, so 0.85 less five steps of 0.05 is 0.6 and not 0.6000000000000001.
  for (let q = percent(IMAGE_QUALITY.start); q >= percent(IMAGE_QUALITY.floor); q -= percent(IMAGE_QUALITY.step)) {
    const blob = await encode(canvas, q / 100);
    if (blob && blob.size <= IMAGE_MAX_BYTES) return { ok: true, file: new File([blob], jpegName(file.name), { type: "image/jpeg" }) };
  }
  return { ok: false, message: errorText("upload-image-too-large") ?? "" };
}
