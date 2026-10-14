"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { serverEnv } from "@/lib/env.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLinkFetchDeps, createSupabaseDocumentsRepo, safeFetch } from "@/modules/documents";
import { requireAdmin } from "@/modules/identity";
import { runStartLink, runStartText, type StartDocumentResult } from "../link-flow";
import { createQueueRepo } from "../queue-repo";
import { actionFailure } from "../upload-flow";

// Aksh's own click: read this link, or read this text. Both run on his cookie session (RLS and the bucket policies apply), and
// the only server-side request to an address he typed is safeFetch's (documents/safe-fetch.ts). Nothing here is automatic.

const linkInput = z.strictObject({
  url: z.string().trim().min(1).max(2000),
  companyId: z.guid().nullable(),
  filedOn: z.iso.date().nullable(),
});

// No length limit here beyond the framework's request size: a text over the document limit is refused by name (text-too-long).
const textInput = z.strictObject({
  text: z.string(),
  title: z.string().trim().max(160).nullable(),
  companyId: z.guid().nullable(),
  filedOn: z.iso.date().nullable(),
  sourceUrl: z.url({ protocol: /^https?$/ }).regex(/^https?:\/\//).max(2000).nullable(),
});

async function flowDeps() {
  const db = await createSupabaseServerClient();
  const net = createLinkFetchDeps(serverEnv());
  return { docs: createSupabaseDocumentsRepo(db), queue: createQueueRepo(db), fetchLink: (link: string) => safeFetch(link, net), newId: randomUUID };
}

/** Fetches the link on the server, safely, and starts reading what it answered with (a PDF, or a web page as text). */
export async function startLinkAction(input: z.input<typeof linkInput>): Promise<StartDocumentResult> {
  await requireAdmin();
  const parsed = linkInput.safeParse(input);
  if (!parsed.success) return actionFailure(parsed.error);
  const result = await runStartLink(await flowDeps(), parsed.data);
  if (result.ok) revalidatePath("/desk/inbox");
  return result;
}

/** Stores text Aksh pasted and starts reading it. */
export async function startTextAction(input: z.input<typeof textInput>): Promise<StartDocumentResult> {
  await requireAdmin();
  const parsed = textInput.safeParse(input);
  if (!parsed.success) return actionFailure(parsed.error);
  const result = await runStartText(await flowDeps(), parsed.data);
  if (result.ok) revalidatePath("/desk/inbox");
  return result;
}
