// Phase 5 spec s9.4: unit setup fails any test that reaches the global fetch for the hosts the distribution adapters name. Adapters
// are tested with an injected fetch; a test that stubs the global fetch replaces this wrapper for its own duration (unstubGlobals
// puts it back).
const BLOCKED = new Set(["www.googleapis.com", "googleapis.com", "api.resend.com"]);

const real = globalThis.fetch;
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    // A relative address is not an outside host.
  }
  if (BLOCKED.has(host)) return Promise.reject(new Error(`no outbound call in a test: ${host}`));
  return real(input, init);
}) as typeof fetch;
