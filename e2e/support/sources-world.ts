import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { fixtureJpeg } from "@/modules/documents/fixture-sources";
import { requireStack } from "./auth";

// Test setup only (LOCAL stack: requireStack refuses any other API URL). A saved source with the machine's data already read, as the server's read
// would leave it: the admin session saves the link and attaches the company (its own rights), the secret key records the read through
// record_source_fetch and stores the picture in the private bucket (the only way either happens). Nothing leaves the machine: no oEmbed, no picture
// server. The real read, fixtures and all, is exercised by e2e/sources.spec.ts (Task 5); this world is for the screens.

export const WORLD_VIDEO_ID = "e2eSrcVid01";
export const WORLD_TITLE = "How a pump maker finances its dealers";
export const WORLD_CHANNEL = "Dealer Finance Channel";
export const WORLD_NOTE = "Shows how dealer credit is described.";

export type SourcesWorld = { sourceId: string; companyId: string; thumbSha: string };

export async function seedSourceForCompany(db: Db, symbol: string): Promise<SourcesWorld> {
  const stack = requireStack();
  const company = await db.from("companies").select("id").eq("nse_symbol", symbol).single();
  if (company.error) throw company.error;
  const key = `yt:${WORLD_VIDEO_ID}`;
  const existing = await db.from("source_links").select("id, thumb_sha256").eq("url_key", key).maybeSingle();
  if (existing.error) throw existing.error;
  let sourceId = existing.data?.id;
  if (!sourceId) {
    const inserted = await db
      .from("source_links")
      .insert({ url: `https://www.youtube.com/watch?v=${WORLD_VIDEO_ID}`, url_key: key, kind: "youtube", youtube_id: WORLD_VIDEO_ID, note: WORLD_NOTE })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    sourceId = inserted.data.id;
  }
  const attached = await db.from("source_link_companies").insert({ link_id: sourceId, company_id: company.data.id });
  if (attached.error && attached.error.code !== "23505") throw attached.error; // already attached by an earlier run

  const bytes = fixtureJpeg(WORLD_VIDEO_ID);
  const thumbSha = createHash("sha256").update(bytes).digest("hex");
  const service = createClient<Database>(stack.apiUrl, stack.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const uploaded = await service.storage.from("source-thumbs").upload(`yt/${thumbSha}.jpg`, bytes, { contentType: "image/jpeg", upsert: true });
  if (uploaded.error) throw uploaded.error;
  const read = await service.rpc("record_source_fetch", {
    p_link_id: sourceId,
    p_found: true,
    p_title: WORLD_TITLE,
    p_site_name: WORLD_CHANNEL,
    p_channel_url: "https://www.youtube.com/@dealerfinance",
    p_thumb_path: `yt/${thumbSha}.jpg`,
    p_thumb_sha256: thumbSha,
    p_problem: null as unknown as string,
    p_gone: false,
  });
  if (read.error) throw read.error;
  return { sourceId, companyId: company.data.id, thumbSha };
}
