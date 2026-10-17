import { isUuid } from "@/lib/ids";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

// The desk's view of a saved source's picture (Phase 5d, spec s6.5): the admin's own session reads the link's picture path and then the object from the
// private bucket (the admin read policy of migration 0026). The desk page shows it through /desk/sources/[id]/thumb, so the browser never asks the
// picture's origin either. Null means "no picture to show", whatever the reason.

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export async function deskThumbnail(db: Db, id: string): Promise<Uint8Array | null> {
  if (!isUuid(id)) return null;
  const { data: row, error } = await db.from("source_links").select("thumb_path").eq("id", id).maybeSingle();
  if (error) throw dbError("sources.thumbPath", error);
  if (!row?.thumb_path) return null;
  const { data, error: downloadError } = await db.storage.from("source-thumbs").download(row.thumb_path);
  if (downloadError || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return JPEG_MAGIC.every((b, i) => bytes[i] === b) ? bytes : null;
}
