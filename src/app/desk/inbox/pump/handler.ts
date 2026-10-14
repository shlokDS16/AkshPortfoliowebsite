import type { AdminIdentity } from "@/modules/identity";

// The inbox tab's own pump as a plain POST route, not a server action: Next runs one client's server actions at a
// time, so a 50 s slice as an action would hold up Skip, Try again, Raise and the upload calls behind it.

export type PumpDeps = {
  /** The signed-in admin, or null. No redirect: a fetch cannot follow one to a login page. */
  getAdmin: () => Promise<AdminIdentity | null>;
  /** Reads for a short slice; `ran` is how many steps it ran. */
  drain: () => Promise<{ ran: number }>;
  /** NEXT_PUBLIC_SITE_URL. */
  siteUrl: () => string;
};

const json = (body: object, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function createPumpHandler(deps: PumpDeps) {
  return async function POST(request: Request): Promise<Response> {
    // A cross-site page must not be able to start a drain with the admin's cookies: the Origin has to be this site's.
    const origin = request.headers.get("origin");
    if (origin === null || ![new URL(deps.siteUrl()).origin, new URL(request.url).origin].includes(origin)) {
      return json({ error: "forbidden" }, 403);
    }
    if (!(await deps.getAdmin())) return json({ error: "not-signed-in" }, 401);
    try {
      return json({ more: (await deps.drain()).ran > 0 }, 200);
    } catch (error) {
      // Name only: a database message can carry row data. The next pump retries.
      console.error("inbox: tab drain failed", error instanceof Error ? error.name : typeof error);
      return json({ more: false }, 500);
    }
  };
}
