import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { DocumentsRepo } from "./repo";

// The private bucket's calls, split from repo.ts to keep that file under 300 lines. Same session as the rest of the repo: the bucket's
// policies apply to every call.

const BUCKET = "documents";

export function documentStorage(db: Db): Pick<DocumentsRepo, "signUpload" | "putObject" | "objectInfo" | "removeObject"> {
  return {
    async signUpload(path) {
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw dbError("documents.signUpload", { message: error.message });
      return { path: data.path, token: data.token };
    },
    async putObject(path, bytes, contentType) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (error) throw dbError("documents.putObject", { message: error.message });
    },
    async objectInfo(path) {
      const { data, error } = await db.storage.from(BUCKET).list("", { search: path, limit: 1 });
      if (error) throw dbError("documents.objectInfo", { message: error.message });
      // `search` is a prefix match: only the exact name counts.
      const object = data.find((o) => o.name === path);
      if (!object?.metadata) return null;
      return { size: Number(object.metadata.size), mimetype: String(object.metadata.mimetype) };
    },
    async removeObject(path) {
      const { error } = await db.storage.from(BUCKET).remove([path]);
      if (error) throw dbError("documents.removeObject", { message: error.message });
    },
  };
}
