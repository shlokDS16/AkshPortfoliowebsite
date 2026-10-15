import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { registerClock, type ClockRegisterDeps } from "./clock-register";

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

function deps(over: Partial<ClockRegisterDeps> & { rpc?: (name: string, args: unknown) => Promise<RpcResult> } = {}) {
  const { rpc: rpcOver, ...rest } = over;
  const rpc = rpcOver ?? vi.fn(async (): Promise<RpcResult> => ({ data: true, error: null }));
  const d: ClockRegisterDeps = {
    vercelEnv: "production",
    siteUrl: "https://desk.example.com",
    db: () => ({ rpc }) as unknown as Db,
    ...rest,
  };
  return { d, rpc };
}

describe("registerClock (the clock:register step body)", () => {
  it.each([[undefined], ["preview"], ["development"]])("does nothing outside production (VERCEL_ENV=%s)", async (env) => {
    const { d, rpc } = deps({ vercelEnv: env });
    expect(await registerClock(d)).toBe("not production");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("builds no database client outside production", async () => {
    const db = vi.fn();
    expect(await registerClock({ vercelEnv: "preview", siteUrl: "https://x.example.com", db: db as never })).toBe("not production");
    expect(db).not.toHaveBeenCalled();
  });

  it("in production registers the site origin and says so when the address changed", async () => {
    const { d, rpc } = deps();
    expect(await registerClock(d)).toBe("registered https://desk.example.com");
    expect(rpc).toHaveBeenCalledWith("register_clock_target", { p_url: "https://desk.example.com" });
  });

  it("says unchanged when the database kept the same address", async () => {
    const { d } = deps({ rpc: async () => ({ data: false, error: null }) });
    expect(await registerClock(d)).toBe("unchanged https://desk.example.com");
  });

  it("sends the lower-cased origin only (no path, no trailing slash)", async () => {
    const { d, rpc } = deps({ siteUrl: "https://Desk.Example.com/some/path/" });
    await registerClock(d);
    expect(rpc).toHaveBeenCalledWith("register_clock_target", { p_url: "https://desk.example.com" });
  });

  it("fails with the operation and code only when the database refuses (no database text in the heartbeat)", async () => {
    const { d } = deps({ rpc: async () => ({ data: null, error: { message: "secret row text", code: "22023" } }) });
    const error = await registerClock(d).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("secret row text");
    expect((error as Error).message).toContain("22023");
  });
});
