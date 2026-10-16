// Phase 5 spec s9.4, widened by review finding 4: unit setup fails any test that reaches the global fetch for ANY host except this
// machine (a pure loopback allowlist, src/test/outbound-hosts.ts; the e2e guard uses the same list). Adapters are tested with an
// injected fetch; a test that stubs the global fetch replaces this wrapper for its own duration (unstubGlobals puts it back).
// installNoOutbound is a plain function so its own test can hand it a spy and never touch the network.
import { isOutsideHost } from "./outbound-hosts";

const WRAPPED = Symbol.for("aksh.noOutbound");
type Fetch = typeof fetch;

/** Returns a fetch that rejects every outside host and passes everything else to `real`. Wrapping twice does nothing new. */
export function installNoOutbound(real: Fetch): Fetch {
  if ((real as unknown as Record<symbol, unknown>)[WRAPPED]) return real;
  const guarded = ((input: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch {
      // A relative address has no host and is not an outside host.
    }
    if (isOutsideHost(host)) return Promise.reject(new Error(`no outbound call in a test: ${host}`));
    return real(input, init);
  }) as Fetch;
  (guarded as unknown as Record<symbol, unknown>)[WRAPPED] = true;
  return guarded;
}

globalThis.fetch = installNoOutbound(globalThis.fetch);
