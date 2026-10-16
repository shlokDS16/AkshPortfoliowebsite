"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { InvalidInputError, ItemNotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import { type ErrorCode } from "@/lib/messages";
import { doneTo, failState, failTo } from "@/lib/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { runSourceReadNow, startSourceRead } from "@/modules/ops/jobs";
import { addRevision, createSupabaseResearchRepo, getItemWithHistory } from "@/modules/research";
import { SourceError } from "./errors";
import { createSupabaseSourcesRepo } from "./repo";
import { archiveSource, restoreSource, saveSource, updateSource } from "./service";
import { readStudiedForm, studiedStructured } from "./studied";

// The sources desk's server actions. Each one starts with requireAdmin() (proxy.ts is not an auth boundary), reads only what the form
// carries (ids, his note), and answers with a fixed code or a fixed sentence, never database text. The machine's data is not in any form:
// the title, the picture and the hash are read from the table.

export type SourceActionState = { ok: true; id: string; answer: string } | { ok: false; error: ErrorCode };

/** Ids from a form field that repeats: every value must be a UUID, or the request is not ours. */
function idsOf(formData: FormData, name: string): string[] {
  const values = formData.getAll(name);
  if (!values.every(isUuid)) throw new InvalidInputError();
  return [...new Set(values as string[])];
}
const textOf = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** The desk's add form: `url`, `note`, `companyId` (repeated), `themeId` (repeated). The first read of a new link starts at once, after the answer. */
export async function saveSourceAction(formData: FormData): Promise<SourceActionState> {
  await requireAdmin();
  try {
    const repo = createSupabaseSourcesRepo(await createSupabaseServerClient());
    const saved = await saveSource(repo, { url: textOf(formData, "url"), note: textOf(formData, "note"), companyIds: idsOf(formData, "companyId"), themeIds: idsOf(formData, "themeId") });
    if (!saved.duplicate) after(() => startSourceRead(saved.id));
    revalidatePath("/desk/sources");
    return { ok: true, id: saved.id, answer: saved.answer };
  } catch (error) {
    return { ok: false, ...failState(error, "sources") };
  }
}

/** A card's edit form: `note`, `companyId` (repeated), `themeId` (repeated) set the link's note, companies and concepts to exactly what is sent. */
export async function updateSourceAction(id: string, formData: FormData): Promise<SourceActionState> {
  await requireAdmin();
  try {
    if (!isUuid(id)) throw new SourceError("source-not-found");
    const repo = createSupabaseSourcesRepo(await createSupabaseServerClient());
    await updateSource(repo, id, { note: textOf(formData, "note"), companyIds: idsOf(formData, "companyId"), themeIds: idsOf(formData, "themeId") });
    revalidatePath("/desk/sources");
    return { ok: true, id, answer: "" };
  } catch (error) {
    return { ok: false, ...failState(error, "sources") };
  }
}

export async function archiveSourceAction(id: string): Promise<SourceActionState> {
  await requireAdmin();
  try {
    if (!isUuid(id)) throw new SourceError("source-not-found");
    await archiveSource(createSupabaseSourcesRepo(await createSupabaseServerClient()), id);
    revalidatePath("/desk/sources");
    return { ok: true, id, answer: "" };
  } catch (error) {
    return { ok: false, ...failState(error, "sources") };
  }
}

export async function restoreSourceAction(id: string): Promise<SourceActionState> {
  await requireAdmin();
  try {
    if (!isUuid(id)) throw new SourceError("source-not-found");
    await restoreSource(createSupabaseSourcesRepo(await createSupabaseServerClient()), id);
    revalidatePath("/desk/sources");
    return { ok: true, id, answer: "" };
  } catch (error) {
    return { ok: false, ...failState(error, "sources") };
  }
}

export type ReadAgainState = { ok: true; id: string; result: "read" | "problem" | "gone" } | { ok: false; error: ErrorCode };

/** "Read again": that one link now, at most once a minute (the cooldown is not taken from `fetched_at`; see fetch.ts). */
export async function readAgainAction(id: string): Promise<ReadAgainState> {
  await requireAdmin();
  try {
    if (!isUuid(id)) throw new SourceError("source-not-found");
    // The link must exist for this session (RLS) before the server's own client is used to read it.
    if (!(await createSupabaseSourcesRepo(await createSupabaseServerClient()).get(id))) throw new SourceError("source-not-found");
    const answer = await runSourceReadNow(id);
    if (answer === "no such source") throw new SourceError("source-not-found");
    if (answer === "recent") throw new SourceError("source-read-recent");
    revalidatePath("/desk/sources");
    return { ok: true, id, result: answer };
  } catch (error) {
    return { ok: false, ...failState(error, "sources") };
  }
}

/**
 * The company file's "Outside sources" panel (spec s6.5): saves a new revision carrying the chosen sources. Fields: `changeReason`
 * (his, optional; the machine never writes one), then for each source `link` (repeated, in order), `showTitle:<link>` and `note:<link>`.
 * The body and every other key of the record are carried forward from the newest revision; the hash of a shown title is read from the table.
 */
export async function saveStudiedRevisionAction(itemId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isUuid(itemId)) failTo("/desk/items", new ItemNotFoundError(String(itemId)), "sources");
  const back = `/desk/items/${itemId}`;
  let pending = false;
  try {
    const db = await createSupabaseServerClient();
    const research = createSupabaseResearchRepo(db);
    const history = await getItemWithHistory(research, itemId);
    if (!history) throw new ItemNotFoundError(itemId);
    const latest = history.revisions[0];
    const structured = await studiedStructured(
      createSupabaseSourcesRepo(db),
      { kind: history.item.kind, companyId: history.item.companyId, previous: latest?.structured ?? {} },
      readStudiedForm(formData),
    );
    const reason = textOf(formData, "changeReason").trim();
    // conceptIds null: the database carries the revision's concept links forward.
    const saved = await addRevision(research, { itemId, bodyMd: latest?.bodyMd ?? "", structured, changeReason: reason === "" ? null : reason });
    pending = saved.pendingGate;
  } catch (error) {
    failTo(back, error, "sources");
  }
  revalidatePath(back);
  doneTo(back, pending ? "revision-pending-gate" : "revision-saved");
}
