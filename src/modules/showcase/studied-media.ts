// Phase 5d (spec s7, D103): the picture of an outside source a public file shows, served from our own origin. The bucket `source-thumbs` is private;
// the database lets the anonymous role read an object only while a public entry shows it (public_studied), so an unshown or private save cannot be
// fetched or probed by guessing a hash. This file is pure: the caller supplies `download`, which asks storage as anon.

/** The bucket's own ceiling (migration 0026): a larger object is not ours. */
export const MAX_PICTURE_BYTES = 204_800;
const NAME = /^[0-9a-f]{64}\.jpg$/;
const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export type PictureDeps = {
  /** The object's bytes, or null when anon cannot read it. May throw; that is a 404 too. */
  download(path: string): Promise<{ bytes: Uint8Array } | null>;
};

/** `file` is the last path segment as the request carries it. Anything but `<64 lower-case hex>.jpg` is a 404 before storage is asked. */
export async function serveStudiedPicture(file: string, deps: PictureDeps): Promise<Response> {
  if (!NAME.test(file)) return NOT_FOUND();
  let found: { bytes: Uint8Array } | null;
  try {
    found = await deps.download(`yt/${file}`);
  } catch {
    return NOT_FOUND();
  }
  const bytes = found?.bytes;
  // The bucket takes JPEG only and 200 KB at most; a body that is neither is not served whatever its name says.
  if (!bytes || bytes.length > MAX_PICTURE_BYTES || bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return NOT_FOUND();
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      // An hour at the edge and in browsers, with no stale-while-revalidate: a retraction holds rule 11.5's hour.
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "x-content-type-options": "nosniff",
      "content-length": String(bytes.length),
    },
  });
}
