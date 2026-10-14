import { afterEach, describe, expect, it, vi } from "vitest";
import { LINK_MAX_BYTES } from "./limits";
import { safeFetch, type Transport, type TransportResponse } from "./safe-fetch";
import { dns, enc, PUBLIC, refusal, reply, server } from "./safe-fetch-fakes";

afterEach(() => vi.useRealTimers());

describe("the 50 MB cap is enforced while the body streams", () => {
  const ok = { resolve: dns({ "a.example": [PUBLIC] }).resolve };
  const MB = 1_048_576;

  it("takes a body of exactly the cap and refuses one byte more", async () => {
    const exact = server(reply(200, {}, [new Uint8Array(10), new Uint8Array(10)]));
    expect((await safeFetch("https://a.example/", { ...ok, transport: exact.transport, maxBytes: 20 })).bytes.byteLength).toBe(20);
    const over = server(reply(200, {}, [new Uint8Array(10), new Uint8Array(11)]));
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: over.transport, maxBytes: 20 }))).toBe("link-too-large");
  });

  it("stops reading and closes the connection at the cap with no Content-Length at all (an endless body)", async () => {
    let sent = 0;
    const endless = (async function* () {
      for (;;) {
        sent += 1;
        yield new Uint8Array(MB);
      }
    })();
    const res: TransportResponse = { status: 200, headers: { "content-type": "application/pdf" }, body: endless, close: vi.fn() };
    const s = server(res);
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport }))).toBe("link-too-large");
    expect(sent).toBe(LINK_MAX_BYTES / MB + 1); // 50 chunks fit, the 51st crosses the line, and nothing is read after it
    expect(res.close).toHaveBeenCalled();
  });

  it("is not fooled by a Content-Length that undersells the body", async () => {
    const s = server(reply(200, { "content-length": "5" }, [new Uint8Array(30)]));
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport, maxBytes: 20 }))).toBe("link-too-large");
  });

  it("refuses at once when Content-Length already says it is over, reading nothing", async () => {
    const res = reply(200, { "content-length": String(LINK_MAX_BYTES + 1) }, [new Uint8Array(1)]);
    const s = server(res);
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport }))).toBe("link-too-large");
    expect(res.close).toHaveBeenCalled();
  });

  it("the cap is 50 MB (52,428,800 bytes), the same as an upload", () => {
    expect(LINK_MAX_BYTES).toBe(50 * MB);
  });
});

describe("the 30 second limit covers the lookup, the connection and the read", () => {
  const never = <T,>() => new Promise<T>(() => undefined);

  it("cuts off a name server that never answers", async () => {
    vi.useFakeTimers();
    const pending = refusal(safeFetch("https://slow.example/", { resolve: () => never(), transport: server().transport }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe("link-timeout");
  });

  it("cuts off a server that never answers", async () => {
    vi.useFakeTimers();
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport: () => never() }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe("link-timeout");
  });

  it("cuts off a body that stalls half way, and closes the connection", async () => {
    vi.useFakeTimers();
    const stalling = (async function* () {
      yield new Uint8Array(10);
      await never<void>();
    })();
    const res: TransportResponse = { status: 200, headers: {}, body: stalling, close: vi.fn() };
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport: server(res).transport }));
    await vi.advanceTimersByTimeAsync(29_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("link-timeout");
    expect(res.close).toHaveBeenCalled();
  });

  it("one clock for the whole chain: slow hops add up", async () => {
    vi.useFakeTimers();
    const slowHop = (r: TransportResponse) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      return r;
    };
    const s = server(slowHop(reply(302, { location: "/2" })), slowHop(reply(302, { location: "/3" })), slowHop(reply(200, {}, [enc("late")])));
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport: s.transport }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe("link-timeout");
  });

  it("passes the transport a signal that aborts at the deadline", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const transport: Transport = (request) => {
      seen = request.signal;
      return never();
    };
    const pending = refusal(safeFetch("https://slow.example/", { resolve: dns({ "slow.example": [PUBLIC] }).resolve, transport }));
    await vi.advanceTimersByTimeAsync(10);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(seen?.aborted).toBe(true);
    await pending;
  });
});
