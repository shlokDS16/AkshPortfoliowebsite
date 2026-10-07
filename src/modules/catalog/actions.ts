"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InvalidInputError } from "@/lib/errors";
import { doneTo, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { isItemId } from "@/modules/research";
import { setCompanyPublic } from "./companies";
import { decideName, SECTORS } from "./names";

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

const decisionInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new"), name: z.string().trim().min(1, "Give the name.").max(120), sector: z.enum(SECTORS, "Choose a sector from the list.").nullable() }),
  z.object({ kind: z.literal("merge"), intoId: z.guid() }),
  z.object({ kind: z.literal("plain") }),
]);

/** One New names decision (D24). The known-token lists feed the capture bar and highlighter, so the whole desk revalidates. */
export async function decideNameAction(id: string, type: "company" | "theme", formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isItemId(id) || (type !== "company" && type !== "theme")) failTo("/desk/names", new InvalidInputError(), "catalog");
  const text = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = decisionInput.safeParse({
    kind: text("kind"),
    name: text("name"),
    sector: type === "company" ? (text("sector") ?? null) : null,
    intoId: text("intoId"),
  });
  if (!parsed.success) failTo("/desk/names", parsed.error, "catalog");
  try {
    await decideName(await createSupabaseServerClient(), type, id, parsed.data);
  } catch (error) {
    failTo("/desk/names", error, "catalog");
  }
  revalidatePath("/desk", "layout");
  doneTo("/desk/names", "name-saved");
}
