import type { Db } from "@/lib/supabase/types";
import { createSupabaseCatalogRepo } from "@/modules/catalog";
import { createSupabaseResearchRepo } from "@/modules/research";
import { createSupabaseCaptureRepo } from "./repo";
import type { SaveCaptureDeps } from "./service";
import type { CaptureListEntry } from "./types";

export function createCaptureDeps(db: Db): SaveCaptureDeps {
  return {
    captures: createSupabaseCaptureRepo(db),
    catalog: createSupabaseCatalogRepo(db),
    research: createSupabaseResearchRepo(db),
  };
}

export async function listCapturesSince(db: Db, sinceIso: string): Promise<CaptureListEntry[]> {
  return createSupabaseCaptureRepo(db).listSince(sinceIso);
}
