import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFixtureLlm } from "./fixture-llm";
import { createAnchorPort, createLlmPort, createMarketDataPort, createOcrPort } from "./index";
import type { LlmRequest } from "./llm";

const KEY = `gsk_${"k".repeat(40)}`;

describe("createLlmPort (fixture wins; else Groq when a key is set; else AI reading is off)", () => {
  it("is null when nothing is configured", () => {
    expect(createLlmPort({})).toBeNull();
  });

  it("is Groq when a key is set", () => {
    expect(createLlmPort({ GROQ_API_KEY: KEY })?.name).toBe("groq");
    expect(createLlmPort({ GROQ_API_KEY: KEY, LLM_ADAPTER: "groq" })?.name).toBe("groq");
  });

  it("is the fixture when asked, even with a key", () => {
    expect(createLlmPort({ LLM_ADAPTER: "fixture" })?.name).toBe("fixture");
    expect(createLlmPort({ GROQ_API_KEY: KEY, LLM_ADAPTER: "fixture", VERCEL_ENV: "development" })?.name).toBe("fixture");
  });

  it("refuses the fixture on Vercel preview and production (ruling R27): no fake figures, AI reading off", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const VERCEL_ENV of ["preview", "production"]) {
      expect(createLlmPort({ LLM_ADAPTER: "fixture", VERCEL_ENV })).toBeNull();
      expect(createLlmPort({ GROQ_API_KEY: KEY, LLM_ADAPTER: "fixture", VERCEL_ENV })).toBeNull();
    }
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });
});

const page = z.object({
  page_kind: z.enum(["income", "balance", "other"]),
  basis: z.enum(["consolidated", "standalone", "unknown"]),
  unit_header: z.string().nullable(),
  current_header: z.string().nullable(),
  prior_header: z.string().nullable(),
  rows: z.array(z.object({ label: z.string(), current: z.number() })),
});
const req = (user: string): LlmRequest<z.infer<typeof page>> => ({
  model: "fixture",
  system: "s",
  user,
  schema: page,
  schemaName: "page",
  maxCompletionTokens: 100,
});
const income = { page_kind: "income", basis: "consolidated", unit_header: "(Rs. in crore)", current_header: null, prior_header: null, rows: [{ label: "Revenue", current: 1284 }] };

describe("createFixtureLlm", () => {
  it("answers with the first entry whose `when` occurs in the user message, with fixed usage and no rate headers", async () => {
    const llm = createFixtureLlm([
      { when: "Statement of Profit and Loss", output: income },
      { when: "Profit", output: { ...income, page_kind: "balance" } },
    ]);
    expect(await llm.complete(req("page 4: Consolidated Statement of Profit and Loss ..."))).toEqual({
      kind: "ok",
      data: income,
      usage: { promptTokens: 800, completionTokens: 200, totalTokens: 1000 },
      rate: { remainingTokens: null, remainingRequests: null, retryAfterSeconds: null },
    });
  });

  it("answers the empty page when nothing matches (the committed table is empty until Task 12)", async () => {
    const out = await createFixtureLlm().complete(req("Notice of Annual General Meeting"));
    expect(out).toMatchObject({
      kind: "ok",
      data: { page_kind: "other", basis: "unknown", unit_header: null, current_header: null, prior_header: null, rows: [] },
    });
  });

  it("fails loudly as invalid when a fixture drifts from the schema", async () => {
    const llm = createFixtureLlm([{ when: "x", output: { ...income, rows: [{ label: "Revenue" }] } }]);
    const out = await llm.complete(req("x"));
    expect(out.kind).toBe("invalid");
    expect(out.kind === "invalid" && out.issues.join("|")).toMatch(/rows\.0\.current/);
  });
});

describe("createOcrPort (the fixture wins; else OCR.space when a key is set; else scan reading is off)", () => {
  const opts = { maxBytes: 1_048_576 };

  it("is null when no key is set", () => {
    expect(createOcrPort({}, opts)).toBeNull();
  });

  it("is OCR.space when a key is set, and the fixture when LLM_ADAPTER=fixture", () => {
    expect(createOcrPort({ OCRSPACE_API_KEY: "K81234567888957" }, opts)?.name).toBe("ocrspace");
    expect(createOcrPort({ OCRSPACE_API_KEY: "K81234567888957", LLM_ADAPTER: "fixture" }, opts)?.name).toBe("fixture");
    expect(createOcrPort({ LLM_ADAPTER: "fixture", VERCEL_ENV: "development" }, opts)?.name).toBe("fixture");
  });

  it("refuses the fixture on Vercel preview and production (ruling R27)", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const VERCEL_ENV of ["preview", "production"]) {
      expect(createOcrPort({ LLM_ADAPTER: "fixture", VERCEL_ENV, OCRSPACE_API_KEY: "K81234567888957" }, opts)).toBeNull();
    }
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("K81234567888957");
  });

  it("the fixture reads a page as statement text and never calls the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await createOcrPort({ LLM_ADAPTER: "fixture" }, opts)?.read({ bytes: new Uint8Array(3), filetype: "PDF" }, { table: true });
    expect(out).toMatchObject({ kind: "ok" });
    expect(out?.kind === "ok" && out.text).toContain("Statement of Profit and Loss");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("createMarketDataPort (the fixture only against a local database; else NSE; never null)", () => {
  const LOCAL = "http://127.0.0.1:54321";

  it("is NSE by default, with the default templates", () => {
    expect(createMarketDataPort({}).name).toBe("nse");
    expect(createMarketDataPort({ LLM_ADAPTER: "groq", VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }).name).toBe("nse");
  });

  it("is the fixture when LLM_ADAPTER=fixture and the database is on this machine, in every loopback form, and never calls the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const NEXT_PUBLIC_SUPABASE_URL of [LOCAL, "http://localhost:54321", "http://[::1]:54321", "http://LOCALHOST:54321/"]) {
      expect(createMarketDataPort({ LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL }).name).toBe("fixture");
    }
    const port = createMarketDataPort({ LLM_ADAPTER: "fixture", VERCEL_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: LOCAL });
    expect(port.name).toBe("fixture");
    expect(await port.indexClose("2026-10-12")).toMatchObject({ kind: "ok" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuses the fixture with a configuration error against a hosted database, whatever else is set", () => {
    for (const NEXT_PUBLIC_SUPABASE_URL of ["https://abcd.supabase.co", "https://abcd.supabase.co/", "http://10.0.0.5:54321", "https://127.0.0.1.evil.test", "http://localhost.evil.test:54321", "http://evil.test/localhost", "http://127.0.0.1@evil.test", "https://evil.test/?u=http://127.0.0.1", "not a url", "", undefined]) {
      for (const VERCEL_ENV of [undefined, "development", "preview", "production"]) {
        expect(() => createMarketDataPort({ LLM_ADAPTER: "fixture", VERCEL_ENV, NEXT_PUBLIC_SUPABASE_URL })).toThrow(/LLM_ADAPTER=fixture is only allowed with a local database/);
      }
    }
  });

  it("the error names the setting and carries no URL", () => {
    try {
      createMarketDataPort({ LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "https://secretproject.supabase.co" });
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("secretproject");
    }
  });

  it("does not change how the LLM and OCR fixtures are chosen", () => {
    expect(createLlmPort({ LLM_ADAPTER: "fixture" })?.name).toBe("fixture");
    expect(createOcrPort({ LLM_ADAPTER: "fixture" }, { maxBytes: 1 })?.name).toBe("fixture");
  });

  it("takes the templates from the environment, and refuses one that points at another host", () => {
    const ok = "https://nsearchives.nseindia.com/content/cm/x_{YYYYMMDD}.zip";
    expect(createMarketDataPort({ NSE_BHAVCOPY_URL_TEMPLATE: ok }).name).toBe("nse");
    expect(() => createMarketDataPort({ NSE_BHAVCOPY_URL_TEMPLATE: "https://evil.example/{YYYYMMDD}.zip" })).toThrow(/NSE_BHAVCOPY_URL_TEMPLATE/);
    expect(() => createMarketDataPort({ NSE_INDEX_URL_TEMPLATE: "https://evil.example/{DDMMYYYY}.csv" })).toThrow(/NSE_INDEX_URL_TEMPLATE/);
  });
});

describe("createAnchorPort (off unless the owner set both variables; the fixture only against a local database; never null)", () => {
  const LOCAL = "http://127.0.0.1:54321";
  const GIST = "aa11bb22cc33dd44ee55ff6677889900";
  const TOKEN = "github_pat_11ABCDEFG0123456789_secretsecretsecret";

  it("is off by default and when either variable is missing: every call answers not_configured, with no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const env of [{}, { GITHUB_GIST_TOKEN: TOKEN }, { LEDGER_ANCHOR_GIST_ID: GIST }, { GITHUB_GIST_TOKEN: "", LEDGER_ANCHOR_GIST_ID: "" }]) {
      const port = createAnchorPort(env);
      expect(port.name).toBe("off");
      expect(port.publicUrl).toBeNull();
      expect(await port.read("ledger-2026.jsonl")).toEqual({ kind: "not_configured" });
      expect(await port.write("ledger-2026.jsonl", "x\n", { expected: null })).toEqual({ kind: "not_configured" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("is the Gist adapter when both are set", () => {
    const port = createAnchorPort({ GITHUB_GIST_TOKEN: TOKEN, LEDGER_ANCHOR_GIST_ID: GIST });
    expect(port.name).toBe("github-gist");
    expect(port.publicUrl).toBe(`https://gist.github.com/${GIST}`);
  });

  it("refuses a hostile gist id or a token with a header break, without echoing either", () => {
    expect(() => createAnchorPort({ GITHUB_GIST_TOKEN: TOKEN, LEDGER_ANCHOR_GIST_ID: "../../users/x" })).toThrow(/gist id/);
    expect(() => createAnchorPort({ GITHUB_GIST_TOKEN: `${TOKEN}\r\nX: 1`, LEDGER_ANCHOR_GIST_ID: GIST })).toThrow(/token/);
    try {
      createAnchorPort({ GITHUB_GIST_TOKEN: TOKEN, LEDGER_ANCHOR_GIST_ID: "../../users/x" });
    } catch (error) {
      expect((error as Error).message).not.toContain("users");
    }
  });

  it("is the fixture when LLM_ADAPTER=fixture and the database is on this machine, with or without the variables", () => {
    for (const NEXT_PUBLIC_SUPABASE_URL of [LOCAL, "http://localhost:54321", "http://[::1]:54321"]) {
      expect(createAnchorPort({ LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL }).name).toBe("fixture");
    }
    expect(createAnchorPort({ LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: LOCAL, GITHUB_GIST_TOKEN: TOKEN, LEDGER_ANCHOR_GIST_ID: GIST }).name).toBe("fixture");
  });

  it("refuses the fixture with a configuration error against a hosted database, and carries no URL", () => {
    for (const NEXT_PUBLIC_SUPABASE_URL of ["https://abcd.supabase.co", "http://10.0.0.5:54321", "https://127.0.0.1.evil.test", "http://127.0.0.1@evil.test", "not a url", "", undefined]) {
      expect(() => createAnchorPort({ LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL })).toThrow(/LLM_ADAPTER=fixture is only allowed with a local database/);
    }
    try {
      createAnchorPort({ LLM_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "https://secretproject.supabase.co" });
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("secretproject");
    }
  });

  it("LLM_ADAPTER=groq does not switch the fixture on", () => {
    expect(createAnchorPort({ LLM_ADAPTER: "groq", NEXT_PUBLIC_SUPABASE_URL: LOCAL }).name).toBe("off");
  });
});
