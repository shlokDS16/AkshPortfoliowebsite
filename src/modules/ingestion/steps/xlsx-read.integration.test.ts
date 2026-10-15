import { execFileSync, execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseDocumentsRepo, XLSX_MIME } from "@/modules/documents";
import { createSupabaseValuationRepo, machineValuation } from "@/modules/valuation";
import { REFUSAL_MESSAGES } from "@/modules/valuation/client";
import { createMemoryDigestsRepo } from "@/test/fakes/digests-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo } from "@/test/fakes/usage-repo";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step } from "../types";
import { xlsxRead } from "./xlsx-read";

// Integration (Plan 2.7 Task 2): the real xlsx_read step with the real repos on the LOCAL stack, as service_role (the secret key): the bucket takes
// the workbook and the model object, the column grants and check constraints let the step record a read and a refusal, and the committed fixture
// reaches `ready`. Fixture rows go in as the database owner (an upload and its version are made by Aksh's session, which this test does not have),
// through the database container, and are removed afterwards. Skipped, with the reason printed, when no local stack answers. Never reads hosted credentials.

function localStack(): { url: string; secretKey: string; container: string } | null {
  try {
    const out = execSync("pnpm supabase status -o env", { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] });
    const get = (name: string) => new RegExp(`^${name}="?([^"\\r\\n]+)"?`, "m").exec(out)?.[1];
    const container = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8", timeout: 20_000 }).split(/\r?\n/)[0]?.trim();
    const url = get("API_URL");
    const secretKey = get("SECRET_KEY");
    return url && secretKey && container ? { url, secretKey, container } : null;
  } catch {
    return null;
  }
}

const stack = localStack();
if (!stack) console.warn("xlsx-read.integration: no local Supabase stack, skipping (run `pnpm supabase start`)");

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fixture = () => new Uint8Array(readFileSync(new URL("../../../../e2e/fixtures/model-small.xlsx", import.meta.url)));

describe.skipIf(!stack)("xlsx_read against the local database and bucket (service_role)", () => {
  const db = createClient<Database>(stack?.url ?? "http://127.0.0.1:54321", stack?.secretKey ?? "skipped-no-local-stack", { auth: { persistSession: false, autoRefreshToken: false } });
  const company = randomUUID();
  const made: { doc: string; version: string }[] = [];

  const sql = (statement: string) => execFileSync("docker", ["exec", "-i", stack!.container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", statement], { stdio: "ignore" });

  async function workbook(bytes: Uint8Array) {
    const doc = randomUUID();
    const version = randomUUID();
    if (made.length === 0) sql(`insert into public.companies (id, slug, name) values ('${company}', 'it-${company.slice(0, 8)}', 'Integration Ltd')`);
    sql(
      `insert into public.documents (id, company_id, title, kind, storage_path, sha256, bytes, status) values ('${doc}', '${company}', 'Integration model', 'xlsx', '${doc}.xlsx', '${sha256(bytes)}', ${bytes.byteLength}, 'active'); ` +
        `insert into public.valuation_versions (id, company_id, document_id, version_no) values ('${version}', '${company}', '${doc}', ${made.length + 1})`,
    );
    made.push({ doc, version });
    const { error } = await db.storage.from("documents").upload(`${doc}.xlsx`, bytes, { contentType: XLSX_MIME });
    expect(error, "the bucket takes a workbook").toBeNull();
    return { doc, version };
  }

  function deps(): StepDeps {
    return {
      llm: null, ocr: null, transcriber: null,
      models: { text: "t", vision: "v", classify: "c", whisper: "w" },
      repos: {
        documents: machineDocuments(createSupabaseDocumentsRepo(db)), usage: createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(),
        research: createMemoryResearch(), digests: createMemoryDigestsRepo(), valuation: machineValuation(createSupabaseValuationRepo(db)),
      },
      now: () => new Date(),
      clock: Date.now,
    };
  }
  const run = (documentId: string) => {
    const step: Step = {
      id: "s", jobId: "j", kind: "xlsx_read", pageNo: 1, pass: 1, args: {}, status: "running", schemaFailures: 0, providerFailures: 0, leaseExpiries: 0,
      notBefore: new Date().toISOString(), leaseOwner: "o", lastError: null,
    };
    return xlsxRead({ step, documentId, deadline: Date.now() + 240_000, deps: deps() });
  };

  afterAll(async () => {
    if (!stack || made.length === 0) return;
    await db.storage.from("documents").remove(made.flatMap((m) => [`${m.doc}.xlsx`, `models/${m.version}.json`]));
    const docs = made.map((m) => `'${m.doc}'`).join(", ");
    sql(`delete from public.valuation_versions where document_id in (${docs}); delete from public.documents where id in (${docs}); delete from public.companies where id = '${company}'`);
  });

  it("reads the committed fixture to ready: the object is in the bucket and the version carries the machine columns", async () => {
    const { doc, version } = await workbook(fixture());
    expect(await run(doc)).toMatchObject({ kind: "done", result: { sheets: 3 } });

    const row = await db.from("valuation_versions").select("status, refusal, model_path, sheet_count, cell_count, formula_count, report, engine, read_at, confirmed_at").eq("id", version).single();
    expect(row.error).toBeNull();
    expect(row.data).toMatchObject({ status: "ready", refusal: null, model_path: `models/${version}.json`, sheet_count: 3, confirmed_at: null });
    expect(row.data?.formula_count).toBeGreaterThan(30);
    expect(row.data?.engine).toMatchObject({ sheetjs: "0.20.3", ironcalcNode: "0.8.3", ironcalcWasm: "0.8.4" });
    expect(row.data?.read_at).not.toBeNull();

    const object = await db.storage.from("documents").download(`models/${version}.json`);
    expect(object.error).toBeNull();
    const stored = JSON.parse(await object.data!.text());
    expect(stored).toMatchObject({ modelVersion: 1 });
    expect(stored.index.counts.sheets).toBe(3);
    expect(row.data?.report).toEqual(stored.report);

    // A second run (a duplicate or reclaimed step) replaces the object and the columns and changes nothing else.
    expect(await run(doc)).toMatchObject({ kind: "done", result: { sheets: 3 } });
    const again = await db.from("valuation_versions").select("status, model_path, cell_count, formula_count").eq("id", version).single();
    expect(again.data).toMatchObject({ status: "ready", model_path: `models/${version}.json`, cell_count: stored.index.counts.cells, formula_count: stored.index.counts.formulas });
  });

  it("records a refusal on the version and gives the card its sentence", async () => {
    const { doc, version } = await workbook(new TextEncoder().encode(`this is not a workbook ${randomUUID()}`));
    expect(await run(doc)).toEqual({ kind: "attention", error: REFUSAL_MESSAGES.not_xlsx });
    const row = await db.from("valuation_versions").select("status, refusal, model_path, report").eq("id", version).single();
    expect(row.data).toEqual({ status: "refused", refusal: "not_xlsx", model_path: null, report: null });
  });
});
