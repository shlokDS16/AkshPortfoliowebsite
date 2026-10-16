import { expect, test, type BrowserContext } from "@playwright/test";

// Nothing outbound in a test (Plan global constraint; spec s9.4). Every browser context of a public or video spec is routed through here:
// a request to the machine itself (127.0.0.1 or localhost, the app and the local Supabase stack) goes on, anything else is recorded and
// answered here, so it never leaves the machine. After each test the record must hold nothing but the privacy-enhanced YouTube frame,
// which only a press on Play may ask for (the press tests count it). A page that reached any other host fails its test by name.

const LOCAL = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** The only outside host a public page may ask for, and only after the press. The answer is an empty page. */
export const FRAME_HOST = /(?:^|\.)youtube-nocookie\.com$/;
const EMPTY_FRAME = "<!doctype html><title>frame</title><p>frame</p>";

const seen = new WeakMap<BrowserContext, string[]>();

/** Starts recording and answering outside requests for this context; the returned list fills as the page runs. */
export async function guardOutbound(context: BrowserContext): Promise<string[]> {
  const known = seen.get(context);
  if (known) return known;
  const outside: string[] = [];
  seen.set(context, outside);
  await context.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (LOCAL.has(url.hostname)) return route.fallback();
    outside.push(url.href);
    if (FRAME_HOST.test(url.hostname)) return route.fulfill({ status: 200, contentType: "text/html", body: EMPTY_FRAME });
    return route.abort();
  });
  return outside;
}

/** The hosts in a list of addresses, in order (an address that does not parse is shown as it is). */
export const hostsOf = (urls: readonly string[]): string[] =>
  urls.map((u) => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  });

/** Call once at the top of a spec file: guards every test's context and fails a test that reached a host other than the YouTube frame. */
export function installOutboundGuard(): void {
  test.beforeEach(async ({ context }) => {
    await guardOutbound(context);
  });
  test.afterEach(async ({ context }) => {
    const reached = (seen.get(context) ?? []).filter((u) => !FRAME_HOST.test(new URL(u).hostname));
    expect(reached, "a page reached a host outside this machine (nothing is sent anywhere in a test)").toEqual([]);
  });
}
