import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ latest: {} as Record<string, string | null>, fail: false, serverClients: 0 }));

// The strip reads as the signed-in admin (session client, RLS). It must never ask for the service client.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    state.serverClients += 1;
    return {};
  },
}));
vi.mock("@/modules/ops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/ops")>()),
  createSupabaseHeartbeatRepo: () => ({
    record: async () => undefined,
    latestOk: async () => {
      if (state.fail) throw new Error("connection refused: password=hunter2");
      return state.latest;
    },
  }),
}));

import { HealthStrip } from "./health-strip";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const render = async () => renderToStaticMarkup(await HealthStrip());

beforeEach(() => {
  state.latest = {};
  state.fail = false;
  state.serverClients = 0;
});

describe("HealthStrip", () => {
  it("renders nothing while both clocks are fresh", async () => {
    state.latest = { "heartbeat:pump": ago(10), "heartbeat:daily": ago(600) };
    expect(await render()).toBe("");
  });

  it("names the stale clocks in plain English as an alert", async () => {
    state.latest = { "heartbeat:pump": ago(300), "heartbeat:daily": null };
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("the 15-minute pump last ran 5 h ago");
    expect(html).toContain("the daily job has never run");
  });

  it("reads through the session client", async () => {
    state.latest = { "heartbeat:pump": ago(10), "heartbeat:daily": ago(600) };
    await render();
    expect(state.serverClients).toBe(1);
  });

  it("shows a fixed notice, never the error text, when the database cannot be read", async () => {
    state.fail = true;
    const html = await render();
    expect(html).toContain("The database cannot be reached right now");
    expect(html).not.toMatch(/hunter2|connection refused/);
  });
});
