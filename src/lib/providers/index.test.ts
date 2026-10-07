import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFixtureLlm } from "./fixture-llm";
import { createLlmPort } from "./index";
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
      usage: { promptTokens: 2500, completionTokens: 500, totalTokens: 3000 },
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
