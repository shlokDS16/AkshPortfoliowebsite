import { describe, expect, it } from "vitest";
import { createFixtureLlm } from "@/lib/providers/fixture-llm";
import { classifySchema } from "./prompts";

// The fixture answers a page-classification request with "no page placed", so a local e2e that reaches the classifier
// never fails the schema; a committed entry still wins when the user text matches.

describe("fixture LLM, page classification", () => {
  const req = { model: "m", system: "s", user: "Page 3:\nParticulars 1,200.00", schema: classifySchema, schemaName: "page_classification", maxCompletionTokens: 400 };

  it("answers an empty list when nothing matches", async () => {
    expect(await createFixtureLlm([]).complete(req)).toMatchObject({ kind: "ok", data: { pages: [] } });
  });

  it("answers from a matching entry", async () => {
    const llm = createFixtureLlm([{ when: "Particulars 1,200.00", output: { pages: [{ page: 3, kind: "cf", confidence: 0.9 }] } }]);
    expect(await llm.complete(req)).toMatchObject({ kind: "ok", data: { pages: [{ page: 3, kind: "cf", confidence: 0.9 }] } });
  });
});
