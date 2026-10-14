import type { APIRequestContext, APIResponse, Page } from "@playwright/test";

// Test setup only. A server action called from the page is a POST that carries a `Next-Action` id and an encoded body; a form
// that is sent by script (the ledger forms) has no hidden id field to read off the page. So the admin's own browser sends the
// action once, this file keeps the request, and `replayWithoutSession` sends the very same request with no cookie. If the
// action did not check the session itself, that second request would write.

export type CapturedAction = { url: string; headers: Record<string, string>; body: Buffer };

const DROP = new Set(["cookie", "host", "content-length", "connection", "origin", "referer"]);

/** Runs `trigger` (a click in the admin's browser) and keeps the server-action request it sends. */
export async function captureAction(page: Page, trigger: () => Promise<void>): Promise<CapturedAction> {
  const sent = page.waitForRequest((r) => r.method() === "POST" && "next-action" in r.headers());
  await trigger();
  const request = await sent;
  const body = request.postDataBuffer();
  if (!body) throw new Error("the action request carried no body");
  const headers = Object.fromEntries(Object.entries(await request.allHeaders()).filter(([name]) => !DROP.has(name.toLowerCase())));
  return { url: request.url(), headers, body };
}

/** Sends the captured request again with no session. `edit` may change the text of the body (ASCII only), for a marker. */
export async function replayWithoutSession(
  request: APIRequestContext,
  captured: CapturedAction,
  origin: string,
  edit: (body: string) => string = (b) => b,
): Promise<APIResponse> {
  return request.post(captured.url, {
    headers: { ...captured.headers, origin },
    data: Buffer.from(edit(captured.body.toString("latin1")), "latin1"),
    maxRedirects: 0,
  });
}

/** An action that sends the visitor to the sign-in page answers 303 to /login, or (when called by script) names it in x-action-redirect. */
export function sentToLogin(response: APIResponse): boolean {
  const location = response.headers()["location"] ?? response.headers()["x-action-redirect"] ?? "";
  return /\/login(?:[;?]|$)/.test(location);
}
