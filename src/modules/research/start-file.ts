import { InvalidInputError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { latestFileForCompany } from "./queries";
import { createItem } from "./service";
import type { ResearchRepo } from "./types";

// "Start a file for <company>" on the review screen (spec s6.5, amendment R13): Aksh's click makes the company's
// thesis through the ordinary createItem service. There is no other insert path, and no machine text goes in.

export type FileLookup = {
  /** The company's newest thesis or case study that is not archived, or null. */
  fileOf(companyId: string): Promise<{ itemId: string; title: string } | null>;
  companyName(companyId: string): Promise<string | null>;
};

export function createFileLookup(db: Db): FileLookup {
  return {
    async fileOf(companyId) {
      const file = await latestFileForCompany(db, companyId);
      return file ? { itemId: file.itemId, title: file.title } : null;
    },
    async companyName(companyId) {
      const { data, error } = await db.from("companies").select("name").eq("id", companyId).maybeSingle();
      if (error) throw dbError("research.companyName", error);
      return data?.name ?? null;
    },
  };
}

/** The company's file: the one it already has, else a new private thesis titled with the company's name, empty body and facts. */
export async function startFile(repo: ResearchRepo, lookup: FileLookup, companyId: string): Promise<{ itemId: string }> {
  if (!isUuid(companyId)) throw new InvalidInputError();
  const existing = await lookup.fileOf(companyId);
  if (existing) return { itemId: existing.itemId };
  const name = await lookup.companyName(companyId);
  if (!name) throw new InvalidInputError();
  const { item } = await createItem(repo, { kind: "thesis", title: name, companyId });
  return { itemId: item.id };
}
