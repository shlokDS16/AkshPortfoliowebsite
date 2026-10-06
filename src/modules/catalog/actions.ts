"use server";

import { revalidatePath } from "next/cache";
import { InvalidInputError } from "@/lib/errors";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { isItemId } from "@/modules/research";
import { setCompanyPublic } from "./companies";

export async function makeCompanyPublicAction(companyId: string, itemId: string): Promise<void> {
  await requireAdmin();
  const back = isItemId(itemId) ? `/desk/items/${itemId}` : "/desk/items";
  if (!isItemId(companyId) || !isItemId(itemId)) failTo(back, new InvalidInputError(), "catalog");
  try {
    await setCompanyPublic(await createSupabaseServerClient(), companyId);
  } catch (error) {
    failTo(back, error, "catalog");
  }
  revalidatePath(back);
  doneTo(back, "company-public", "#gate");
}
