import { describe, expect, it, vi } from "vitest";
import { safeFetch, type TransportResponse } from "./safe-fetch";
import { dns, enc, PUBLIC, refusal, reply, server } from "./safe-fetch-fakes";

// Phase 5d (spec s6.3): `prefixOnly` reads the first `maxBytes` of a page and stops, where a plain read refuses a longer body;
// `passStatuses` hands back the answer of a few listed non-success statuses instead of refusing it. Every other rule is unchanged.

const ok = { resolve: dns({ "a.example": [PUBLIC], "internal.example": [{ address: "10.0.0.5", family: 4 }] }).resolve };
const text = (n: number) => enc("x".repeat(n));

describe("prefixOnly", () => {
  it("returns exactly the first maxBytes of a longer body and closes the connection", async () => {
    const res = reply(200, { "content-type": "text/html" }, [text(10), text(10), text(10)]);
    const s = server(res);
    const got = await safeFetch("https://a.example/", { ...ok, transport: s.transport, maxBytes: 25, prefixOnly: true });
    expect(got.bytes.byteLength).toBe(25);
    expect(res.close).toHaveBeenCalled();
  });

  it("stops reading an endless body at the cap", async () => {
    let sent = 0;
    const endless = (async function* () {
      for (;;) {
        sent += 1;
        yield text(1000);
      }
    })();
    const res: TransportResponse = { status: 200, headers: { "content-type": "text/html" }, body: endless, close: vi.fn() };
    const got = await safeFetch("https://a.example/", { ...ok, transport: server(res).transport, maxBytes: 5000, prefixOnly: true });
    expect(got.bytes.byteLength).toBe(5000);
    expect(sent).toBe(5);
    expect(res.close).toHaveBeenCalled();
  });

  it("does not refuse early on a Content-Length over the cap", async () => {
    const res = reply(200, { "content-length": "9999999", "content-type": "text/html" }, [text(30)]);
    const got = await safeFetch("https://a.example/", { ...ok, transport: server(res).transport, maxBytes: 20, prefixOnly: true });
    expect(got.bytes.byteLength).toBe(20);
  });

  it("returns a shorter body whole", async () => {
    const got = await safeFetch("https://a.example/", { ...ok, transport: server(reply(200, {}, [text(7)])).transport, maxBytes: 20, prefixOnly: true });
    expect(got.bytes.byteLength).toBe(7);
  });

  it("a plain read still refuses the same body", async () => {
    const s = server(reply(200, {}, [text(30)]));
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport, maxBytes: 20 }))).toBe("link-too-large");
  });

  it("still enforces every other rule: scheme, private addresses, redirects, status, time", async () => {
    expect(await refusal(safeFetch("http://a.example/", { ...ok, transport: server().transport, prefixOnly: true }))).toBe("link-invalid");
    expect(await refusal(safeFetch("https://internal.example/", { ...ok, transport: server().transport, prefixOnly: true }))).toBe("link-blocked");
    const loop = server(reply(302, { location: "https://a.example/1" }), reply(302, { location: "https://a.example/2" }), reply(302, { location: "https://a.example/3" }));
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: loop.transport, prefixOnly: true }))).toBe("link-redirects");
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: server(reply(500)).transport, prefixOnly: true }))).toBe("link-failed");
  });
});

describe("passStatuses", () => {
  it("hands back a listed status with no body and the status itself", async () => {
    const res = reply(404, { "content-type": "text/plain" }, [text(5)]);
    const got = await safeFetch("https://a.example/", { ...ok, transport: server(res).transport, passStatuses: [401, 404] });
    expect(got).toMatchObject({ status: 404, finalUrl: "https://a.example/" });
    expect(got.bytes.byteLength).toBe(0);
    expect(res.close).toHaveBeenCalled();
  });

  it("still refuses a status that is not listed", async () => {
    expect(await refusal(safeFetch("https://a.example/", { ...ok, transport: server(reply(403)).transport, passStatuses: [401, 404] }))).toBe("link-failed");
  });

  it("a success carries its status and a redirect is never passed through", async () => {
    const got = await safeFetch("https://a.example/", { ...ok, transport: server(reply(200, {}, [text(3)])).transport });
    expect(got.status).toBe(200);
    const s = server(reply(302, { location: "https://a.example/b" }), reply(404));
    expect((await safeFetch("https://a.example/", { ...ok, transport: s.transport, passStatuses: [302, 404] })).status).toBe(404);
    expect(s.calls).toHaveLength(2);
  });
});
