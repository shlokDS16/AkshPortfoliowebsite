import { describe, expect, it, vi } from "vitest";
import { DocumentError } from "./errors";
import { safeFetch, type Transport } from "./safe-fetch";
import { dns, enc, PUBLIC, refusal, reply, server } from "./safe-fetch-fakes";

describe("redirects", () => {
  const page = (text: string) => reply(200, { "content-type": "text/plain" }, [enc(text)]);
  const to = (location: string, status = 302) => reply(status, { location });

  it("follows up to two, resolving and vetting each hop's host again", async () => {
    const d = dns({ "a.example": [PUBLIC], "b.example": [{ address: "93.184.216.35", family: 4 }], "c.example": [{ address: "93.184.216.36", family: 4 }] });
    const s = server(to("https://b.example/two"), to("/three", 301), page("done"));
    const out = await safeFetch("https://a.example/one", { resolve: d.resolve, transport: s.transport });
    expect(new TextDecoder().decode(out.bytes)).toBe("done");
    expect(out.finalUrl).toBe("https://b.example/three");
    expect(d.asked).toEqual(["a.example", "b.example", "b.example"]);
    expect(s.calls.map((c) => c.addresses[0].address)).toEqual(["93.184.216.34", "93.184.216.35", "93.184.216.35"]);
  });

  it("refuses a third redirect", async () => {
    const d = dns({ "a.example": [PUBLIC] });
    const s = server(to("/1"), to("/2"), to("/3"), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-redirects");
    expect(s.calls).toHaveLength(3);
  });

  it.each([303, 307, 308])("treats %i as a redirect too", async (status) => {
    const s = server(to("/next", status), page("ok"));
    await safeFetch("https://a.example/", { resolve: dns({ "a.example": [PUBLIC] }).resolve, transport: s.transport });
    expect(s.calls).toHaveLength(2);
  });

  it("refuses a redirect to a name that resolves to a private address, and never connects to it", async () => {
    const d = dns({ "a.example": [PUBLIC], "evil.example": [{ address: "10.0.0.7", family: 4 }] });
    const s = server(to("https://evil.example/steal"), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(s.calls).toHaveLength(1);
  });

  it("DNS rebinding on a redirect: the second name answers private the moment it is looked up", async () => {
    const d = dns({ "a.example": [PUBLIC], "rebind.example": [{ address: "169.254.169.254", family: 4 }] });
    const s = server(to("https://rebind.example/"), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(s.calls.map((c) => c.url.hostname)).toEqual(["a.example"]);
  });

  it.each([
    ["an address written as a number", "https://127.0.0.1/", "link-blocked"],
    ["the metadata address", "https://169.254.169.254/latest/meta-data/", "link-blocked"],
    ["an IPv6 loopback", "https://[::1]/", "link-blocked"],
    // Not Aksh's typing, so "could not open", never "use a full link".
    ["http", "http://a.example/", "link-failed"],
    ["a link with a password", "https://u:p@a.example/", "link-failed"],
    ["another port", "https://a.example:8080/", "link-failed"],
    ["another scheme", "ftp://a.example/", "link-failed"],
  ] as const)("refuses a redirect to %s", async (_what, location, code) => {
    const d = dns({ "a.example": [PUBLIC] });
    const s = server(to(location), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: d.resolve, transport: s.transport }))).toBe(code);
    expect(s.calls).toHaveLength(1);
  });

  it("fails a redirect that has no place to go", async () => {
    const s = server(reply(302), page("never"));
    expect(await refusal(safeFetch("https://a.example/", { resolve: dns({ "a.example": [PUBLIC] }).resolve, transport: s.transport }))).toBe("link-failed");
  });

  it("closes the redirect's connection before it goes on", async () => {
    const first = to("/next");
    const s = server(first, page("ok"));
    await safeFetch("https://a.example/", { resolve: dns({ "a.example": [PUBLIC] }).resolve, transport: s.transport });
    expect(first.close).toHaveBeenCalled();
  });
});

describe("the answer", () => {
  const ok = { resolve: dns({ "a.example": [PUBLIC] }).resolve };

  it("returns the bare, lower-case content type and every byte, in order", async () => {
    const s = server(reply(200, { "content-type": "Text/HTML; charset=UTF-8" }, [enc("<p>one"), enc(" two</p>")]));
    const out = await safeFetch("https://a.example/", { ...ok, transport: s.transport });
    expect(out.contentType).toBe("text/html");
    expect(new TextDecoder().decode(out.bytes)).toBe("<p>one two</p>");
    expect(out.finalUrl).toBe("https://a.example/");
  });

  it("returns an empty type when the server names none", async () => {
    const s = server(reply(200, {}, [enc("x")]));
    expect((await safeFetch("https://a.example/", { ...ok, transport: s.transport })).contentType).toBe("");
  });

  it.each([304, 400, 403, 404, 410, 429, 500, 503])("fails on HTTP %i with a fixed sentence that names no address", async (status) => {
    const s = server(reply(status));
    const code = await refusal(safeFetch("https://a.example/", { ...ok, transport: s.transport }));
    expect(code).toBe("link-failed");
  });

  it("logs a network failure's class and code only: never its message, the link or an address", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transport: Transport = async () => {
      throw Object.assign(new Error("connect ECONNRESET 10.1.2.3:443 for https://a.example/secret?token=abc"), { code: "ECONNRESET" });
    };
    await safeFetch("https://a.example/secret?token=abc", { ...ok, transport }).catch(() => undefined);
    expect(log).toHaveBeenCalledWith("link fetch failed", "Error", "ECONNRESET");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/10\.1\.2\.3|token|secret/);
  });

  it("fails, without the reason, when the connection cannot be made", async () => {
    const transport: Transport = async () => {
      throw new Error("connect ECONNREFUSED 10.1.2.3:443");
    };
    const error = await safeFetch("https://a.example/", { ...ok, transport }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocumentError);
    expect((error as DocumentError).code).toBe("link-failed");
    expect((error as DocumentError).message).not.toMatch(/10\.1\.2\.3|ECONNREFUSED/);
  });
});

