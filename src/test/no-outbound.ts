// Phase 5 spec s9.4: unit setup fails any test that reaches the global fetch for the hosts the distribution adapters name. Adapters
// are tested with an injected fetch; a test that stubs the global fetch replaces this wrapper for its own duration (unstubGlobals
// puts it back). A host is blocked when it is one of these domains or any subdomain of one (youtube.googleapis.com, eu.api.resend.com),
// matched on the parsed host name, never as a prefix or a substring.
const BLOCKED = ["googleapis.com", "resend.com"];
const blocked = (host: string) => BLOCKED.some((domain) => host === domain || host.endsWith(`.${domain}`));

const real = globalThis.fetch;
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    // A relative address is not an outside host.
  }
  if (blocked(host)) return Promise.reject(new Error(`no outbound call in a test: ${host}`));
  return real(input, init);
}) as typeof fetch;
