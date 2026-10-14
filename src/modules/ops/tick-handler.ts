// The door the database clock knocks on (docs/specs/2026-10-14-db-pump-clock.md). pg_cron makes a one-use ticket and pg_net posts it
// here in the x-pump-ticket header. No shared secret: the ticket is valid only if the database made it in the last two minutes.
// Pure factory with injected deps (unit-tested); the wiring to the real database and pump is tick-route.ts.

export type TickDeps = {
  /** public.redeem_pump_ticket through the secret-key client: true once for a fresh ticket. */
  redeem: (token: string) => Promise<boolean>;
  /** The same steps as /api/jobs/run. */
  runPump: () => Promise<unknown>;
  /** next/server `after`: runs the task once the response has been sent. */
  after: (task: () => Promise<void>) => void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

const reply = (body: object | string, status: number) =>
  typeof body === "string" ? new Response(body, { status, headers: NO_STORE }) : Response.json(body, { status, headers: NO_STORE });

export function createTickHandler(deps: TickDeps) {
  return async function POST(request: Request): Promise<Response> {
    const ticket = request.headers.get("x-pump-ticket")?.trim() ?? "";
    // Anything that is not a UUID is turned away before the database is asked anything.
    if (!UUID.test(ticket)) return reply("Unauthorized", 401);

    let redeemed: boolean;
    try {
      redeemed = await deps.redeem(ticket.toLowerCase());
    } catch (error) {
      // Name only: a database message can carry row data. The next tick retries.
      console.error("tick: redeem failed", error instanceof Error ? error.name : typeof error);
      return reply({ ok: false }, 500);
    }
    if (!redeemed) return reply("Unauthorized", 401);

    // 202 now: pg_net gives up after 10 s, the pump may take minutes. The work continues after the response (maxDuration 300).
    deps.after(async () => {
      try {
        await deps.runPump();
      } catch (error) {
        console.error("tick: pump failed", error instanceof Error ? error.name : typeof error);
      }
    });
    return reply({ ok: true }, 202);
  };
}
