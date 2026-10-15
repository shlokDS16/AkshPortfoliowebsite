import { describe, expect, it, vi } from "vitest";
import { createTickHandler, type TickDeps } from "./tick-handler";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const request = (headers: Record<string, string> = {}) => new Request("http://x/api/jobs/tick", { method: "POST", headers });

function build(over: Partial<TickDeps> = {}) {
  const scheduled: (() => Promise<void>)[] = [];
  const deps = {
    redeem: vi.fn<TickDeps["redeem"]>(async () => true),
    runPump: vi.fn(async () => undefined),
    after: vi.fn((task: () => Promise<void>) => void scheduled.push(task)),
    ...over,
  } satisfies TickDeps;
  return { handler: createTickHandler(deps), deps, scheduled };
}

describe("the tick handler (the database clock's door)", () => {
  it.each([[undefined], [""], ["not-a-uuid"], [`${TOKEN}x`], ["' or 1=1 --"], [`${TOKEN} ${TOKEN}`], ["11111111111111111111111111111111"]])(
    "rejects a missing or malformed ticket (%s) with 401 and never touches the database",
    async (value) => {
      const { handler, deps } = build();
      const response = await handler(request(value === undefined ? {} : { "x-pump-ticket": value }));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(deps.redeem).not.toHaveBeenCalled();
      expect(deps.after).not.toHaveBeenCalled();
    },
  );

  it("answers 401 when the database does not redeem the ticket, and runs nothing", async () => {
    const { handler, deps } = build({ redeem: vi.fn(async () => false) });
    const response = await handler(request({ "x-pump-ticket": TOKEN }));
    expect(response.status).toBe(401);
    expect(deps.redeem).toHaveBeenCalledWith(TOKEN);
    expect(deps.after).not.toHaveBeenCalled();
    expect(deps.runPump).not.toHaveBeenCalled();
  });

  it("accepts an upper-case ticket and redeems it lower-cased", async () => {
    const { handler, deps } = build();
    await handler(request({ "x-pump-ticket": TOKEN.toUpperCase() }));
    expect(deps.redeem).toHaveBeenCalledWith(TOKEN);
  });

  it("answers 202 at once and schedules the pump steps after the response", async () => {
    const { handler, deps, scheduled } = build();
    const response = await handler(request({ "x-pump-ticket": TOKEN }));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(scheduled).toHaveLength(1);
    expect(deps.runPump).not.toHaveBeenCalled(); // not yet: it runs inside after()
    await scheduled[0]();
    expect(deps.runPump).toHaveBeenCalledTimes(1);
  });

  it("logs only the error name when the pump throws inside after()", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, scheduled } = build({ runPump: vi.fn(async () => Promise.reject(new TypeError("password=hunter2"))) });
    await handler(request({ "x-pump-ticket": TOKEN }));
    await expect(scheduled[0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("tick: pump failed", "TypeError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2");
  });

  it("answers 500 with a fixed body (and logs the name only) when the redeem call itself fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, deps } = build({ redeem: vi.fn(async () => Promise.reject(new Error("db down: password=hunter2"))) });
    const response = await handler(request({ "x-pump-ticket": TOKEN }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false });
    expect(log).toHaveBeenCalledWith("tick: redeem failed", "Error");
    expect(deps.after).not.toHaveBeenCalled();
  });
});
