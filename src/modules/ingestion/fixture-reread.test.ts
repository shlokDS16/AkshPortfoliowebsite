import { describe, expect, it } from "vitest";
import { extractionSchema } from "./prompts";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";

// The fixture adapter answers a re-read (reasoning effort medium) from the entry's `medium` answer when it has one: the same page,
// read harder, so the e2e can see a re-read change something (Plan 2b Task 8). No test here calls Groq.
const request = (reasoningEffort?: "low" | "medium") => ({
  model: "m", system: "s", user: "Page 4:\nConsolidated Statement of Profit and Loss for the year ended March 31, 2026", schema: extractionSchema, schemaName: "page_extraction",
  maxCompletionTokens: 100, reasoningEffort,
});
const finance = async (effort?: "low" | "medium") => {
  const result = await createFixtureLlm().complete(request(effort));
  if (result.kind !== "ok") throw new Error(result.kind);
  return result.data.rows.find((r) => r.label === "Finance costs")!.current_text;
};

describe("the fixture adapter on a re-read", () => {
  it("reads the P&L page with the misread at low effort and correctly at medium", async () => {
    expect(await finance("low")).toBe("41.70");
    expect(await finance(undefined)).toBe("41.70");
    expect(await finance("medium")).toBe("41.20");
  });

  it("answers medium like low when the entry has no separate re-read answer", async () => {
    const result = await createFixtureLlm().complete({ ...request("medium"), user: "Balance Sheet as at March 31" });
    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.data.rows.map((r) => r.label)).toEqual(["Trade receivables", "Inventories"]);
  });
});
