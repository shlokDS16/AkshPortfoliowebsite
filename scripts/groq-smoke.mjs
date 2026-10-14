// Manual Groq smoke check (plan 2a Task 9 Step 5; not CI, never run by tests). Sends ONE tiny strict-JSON request
// shaped like src/lib/providers/groq.ts and prints only the model id, the HTTP status and the x-ratelimit-* /
// retry-after headers. Never prints the key or the response body.
// Run: node --env-file=.env.local scripts/groq-smoke.mjs
const key = process.env.GROQ_API_KEY?.trim();
const model = process.env.GROQ_MODEL_TEXT?.trim() || "openai/gpt-oss-120b";
if (!key) {
  console.error("GROQ_API_KEY is not set (run with --env-file=.env.local).");
  process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_completion_tokens: 200,
    reasoning_effort: "low",
    include_reasoning: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "smoke",
        strict: true,
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
      },
    },
    messages: [
      { role: "system", content: "Answer in JSON." },
      { role: "user", content: "Reply with ok set to true." },
    ],
  }),
  signal: AbortSignal.timeout(30_000),
});
await res.body?.cancel();

console.log(`model: ${model}`);
console.log(`status: ${res.status}`);
for (const [name, value] of res.headers) {
  if (name.startsWith("x-ratelimit-") || name === "retry-after") console.log(`${name}: ${value}`);
}
