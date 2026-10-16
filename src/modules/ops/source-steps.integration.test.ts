import { execFileSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/types";
import { createLinkFetchDeps } from "@/modules/documents";
import { fetchPendingSources, readSourceNow, recheckSources } from "@/modules/sources";
import { createSourceFetchStore } from "./source-steps";

// Integration: the source steps against the REAL record_source_fetch, purge_stale_source_data, source_links and the private source-thumbs
// bucket on the LOCAL database, as service_role (the secret key), with the made-up fixture sites (no network beyond the local stack).
// Skipped, with the reason printed, when no local stack answers (`pnpm supabase start`). Never reads hosted credentials. It owns the four
// source_links rows 5e000000-...-0001 to 0004 and the pictures it writes: it clears them before and after, as the owner (service_role has no delete).
function localStack(): { url: string; secretKey: string } | null {
  try {
    const out = execSync("pnpm supabase status -o env", { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] });
    const get = (name: string) => new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m").exec(out)?.[1];
    const url = get("API_URL");
    const secretKey = get("SECRET_KEY");
    return url && secretKey ? { url, secretKey } : null;
  } catch {
    return null;
  }
}

const stack = localStack();
if (!stack) console.warn("source-steps.integration: no local Supabase stack, skipping (run `pnpm supabase start`)");

function runSql(sql: string): void {
  execFileSync("pnpm", ["exec", "supabase", "db", "query", "--local", process.platform === "win32" ? `"${sql}"` : sql], { stdio: "ignore", shell: process.platform === "win32" });
}

const ID = (n: number) => `5e000000-0000-4000-8000-00000000000${n}`;
const YT1 = "fxClean0001"; // never read
const YT3 = "fxClean0003"; // read long ago
const YT4 = "fxMissing01"; // read long ago, now gone from YouTube
const IDS = `('${ID(1)}','${ID(2)}','${ID(3)}','${ID(4)}')`;
const CLEAN = `delete from public.source_links where id in ${IDS}`;
// One statement (the CLI takes a single command): a DO block that clears, seeds, and ages two links. The owner runs the machine's own door,
// then ages the check; the guard lets the owner write under its flag.
const SEED = [
  "do $$ begin",
  `delete from public.source_links where id in ${IDS};`,
  "insert into public.source_links (id, url, url_key, kind, youtube_id, note) values",
  `('${ID(1)}','https://youtu.be/${YT1}','yt:${YT1}','youtube','${YT1}','n'),`,
  `('${ID(2)}','https://blog.test/post/clean','blog.test/post/clean','web',null,'n'),`,
  `('${ID(3)}','https://youtu.be/${YT3}','yt:${YT3}','youtube','${YT3}','n'),`,
  `('${ID(4)}','https://youtu.be/${YT4}','yt:${YT4}','youtube','${YT4}','n');`,
  `perform public.record_source_fetch('${ID(3)}', true, 'Old title', 'Old channel', null, null, null, null, false);`,
  `perform public.record_source_fetch('${ID(4)}', true, 'Was here', 'Old channel', null, null, null, null, false);`,
  "perform set_config('app.source_fetch', 'on', true);",
  `update public.source_links set checked_at = now() - interval '31 days', fetched_at = now() - interval '40 days' where id in ('${ID(3)}','${ID(4)}');`,
  "end $$",
].join(" ");

describe.skipIf(!stack)("the source steps against the real SQL and storage on the local database", () => {
  // Vitest still runs this callback to collect a skipped suite, and createClient throws on an empty URL or key.
  const db = createClient<Database>(stack?.url ?? "http://127.0.0.1:1", stack?.secretKey ?? "sb_secret_unused", { auth: { persistSession: false } }) as unknown as Db;
  const store = createSourceFetchStore(db);
  const deps = { store, link: createLinkFetchDeps({ LLM_ADAPTER: "fixture" }), clock: Date.now };
  const row = async (n: number) => (await db.from("source_links").select("*").eq("id", ID(n)).single()).data;
  const objects = async () => ((await db.storage.from("source-thumbs").list("yt", { limit: 1000 })).data ?? []).map((o) => `yt/${o.name}`);

  beforeAll(() => runSql(SEED), 60_000);
  afterAll(async () => {
    const pictures = (await db.from("source_links").select("thumb_path").in("id", [ID(1), ID(2), ID(3), ID(4)])).data ?? [];
    await store.removeThumbs(pictures.flatMap((r) => (r.thumb_path ? [r.thumb_path] : [])));
    runSql(CLEAN);
  }, 60_000);

  it("pending finds the two links never read; stale finds the two read 31 days ago", async () => {
    expect((await store.pending(10)).map((r) => r.id).sort()).toEqual([ID(1), ID(2)]);
    expect((await store.stale(10)).map((r) => r.id).sort()).toEqual([ID(3), ID(4)]);
    expect(await store.byId(ID(1))).toMatchObject({ id: ID(1), kind: "youtube", youtubeId: YT1, fetchedAt: null, gone: false });
    expect(await store.byId("5e000000-0000-4000-8000-0000000000ff")).toBeNull();
  }, 60_000);

  it("sources:fetch reads both, stores the title, channel and picture, and the picture is in the private bucket under its hash", async () => {
    expect(await fetchPendingSources(deps)).toBe("read 2");
    const video = await row(1);
    expect(video).toMatchObject({ title: `Fixture video ${YT1}: how to read a balance sheet`, site_name: "Fixture Channel", channel_url: "https://www.youtube.com/@fixturechannel", fetch_problem: null, gone: false });
    expect(video?.fetched_at).not.toBeNull();
    expect(video?.meta_sha).toMatch(/^[0-9a-f]{64}$/);
    expect(video?.thumb_path).toBe(`yt/${video?.thumb_sha256}.jpg`);
    expect(await objects()).toContain(video?.thumb_path);
    expect(await row(2)).toMatchObject({ title: "A reading of the annual report: clean", site_name: "The Fixture Blog", channel_url: null, thumb_path: null, fetch_problem: null });
    expect((await store.pending(10)).map((r) => r.id)).toEqual([]);
  }, 60_000);

  it("sources:recheck purges the details 31 days old, then reads the two again: one comes back, one is gone", async () => {
    expect(await recheckSources(deps)).toMatch(/^checked 2, gone 1$/);
    expect(await row(3)).toMatchObject({ title: `Fixture video ${YT3}: how to read a balance sheet`, gone: false, fetch_problem: null });
    expect(await row(4)).toMatchObject({ title: null, site_name: null, channel_url: null, thumb_path: null, gone: true, fetch_problem: "not_found" });
  }, 60_000);

  it("'Read again' reads at once, and refuses a second press inside the minute", async () => {
    const attempts = new Map<string, number>();
    expect(await readSourceNow(deps, ID(1), attempts)).toBe("recent"); // read a moment ago by sources:fetch (checked_at is now)
    expect(await readSourceNow({ ...deps, clock: () => Date.now() + 120_000 }, ID(1), attempts)).toBe("read");
  }, 60_000);

  it("a failed try changes neither date and counts the try", async () => {
    const before = await row(2);
    const failing = { ...deps, link: { ...deps.link, transport: async () => { throw new Error("refused"); } } };
    expect(await readSourceNow({ ...failing, clock: () => Date.now() + 300_000 }, ID(2), new Map())).toBe("problem");
    const after = await row(2);
    expect(after).toMatchObject({ fetched_at: before?.fetched_at, checked_at: before?.checked_at, fetch_problem: "unavailable", fetch_attempts: 1, title: before?.title });
  }, 60_000);

  it("the store writes and deletes pictures in the private bucket; purge returns the paths nobody uses", async () => {
    const path = `yt/${"d".repeat(64)}.jpg`;
    await store.putThumb(path, Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]));
    await store.putThumb(path, Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])); // the same hash over itself is fine
    expect(await objects()).toContain(path);
    await store.removeThumbs([path]);
    expect(await objects()).not.toContain(path);
  }, 60_000);
});
