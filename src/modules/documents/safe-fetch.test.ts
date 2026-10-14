import { describe, expect, it } from "vitest";
import { safeFetch, type Address, type Resolver } from "./safe-fetch";
import { dns, enc, PUBLIC, refusal, reply, server } from "./safe-fetch-fakes";

describe("the link itself", () => {
  it.each([
    ["http", "http://example.com/a.pdf"],
    ["ftp", "ftp://example.com/a.pdf"],
    ["file", "file:///etc/passwd"],
    ["javascript", "javascript:alert(1)"],
    ["a user name", "https://user@example.com/"],
    ["a user name and password", "https://user:secret@example.com/"],
    ["a password only", "https://:secret@example.com/"],
    ["a port", "https://example.com:8443/"],
    ["port 80 on https", "https://example.com:80/"],
    ["no host", "https://"],
    ["nothing", ""],
    ["words", "not a link"],
    ["a very long link", `https://example.com/${"a".repeat(2000)}`],
  ])("refuses %s before any lookup or request", async (_what, link) => {
    const d = dns({ "example.com": [PUBLIC] });
    const s = server(reply(200));
    expect(await refusal(safeFetch(link, { resolve: d.resolve, transport: s.transport }))).toBe("link-invalid");
    expect(d.asked).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it("accepts https on the default port, spelled out or not", async () => {
    for (const link of ["https://example.com/a", "https://example.com:443/a"]) {
      const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
      await safeFetch(link, { resolve: dns({ "example.com": [PUBLIC] }).resolve, transport: s.transport });
      expect(s.calls[0].url.href).toBe("https://example.com/a");
    }
  });
});

describe("addresses written into the link are checked the same way as resolved ones", () => {
  it.each([
    "https://127.0.0.1/",
    "https://10.0.0.5/",
    "https://169.254.169.254/latest/meta-data/",
    "https://192.168.1.1/",
    "https://100.64.0.1/",
    "https://0.0.0.0/",
    "https://[::1]/",
    "https://[fe80::1]/",
    "https://[fd00::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:7f00:1]/",
    "https://[::ffff:a9fe:a9fe]/",
    "https://[64:ff9b::7f00:1]/",
    "https://2130706433/", // 127.0.0.1 as one number
    "https://0x7f.1/", // 127.0.0.1 in hex
    "https://017700000001/", // 127.0.0.1 in octal
    "https://127.1/",
  ])("refuses %s without resolving or connecting", async (link) => {
    const d = dns({});
    const s = server(reply(200));
    expect(await refusal(safeFetch(link, { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(d.asked).toEqual([]);
    expect(s.calls).toEqual([]);
  });

  it("connects to a public address written into the link", async () => {
    const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
    await safeFetch("https://93.184.216.34/a", { resolve: dns({}).resolve, transport: s.transport });
    expect(s.calls[0].addresses[0]).toEqual({ address: "93.184.216.34", family: 4 });
  });
});

describe("the host name is resolved and every answer must be public", () => {
  it.each([
    ["10.0.0.5"], ["172.16.0.1"], ["172.31.255.255"], ["192.168.0.10"], ["127.0.0.1"], ["169.254.169.254"], ["100.64.0.1"],
    ["0.0.0.0"], ["192.0.0.8"], ["192.0.2.1"], ["198.18.0.1"], ["198.51.100.1"], ["203.0.113.1"], ["224.0.0.1"], ["240.0.0.1"], ["255.255.255.255"],
  ])("refuses a name that resolves to %s, and connects to nothing", async (address) => {
    const d = dns({ "internal.example": [{ address, family: 4 }] });
    const s = server(reply(200));
    expect(await refusal(safeFetch("https://internal.example/x", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
    expect(s.calls).toEqual([]);
  });

  it.each(["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2001:db8::1"])(
    "refuses a name that resolves to the IPv6 address %s",
    async (address) => {
      const d = dns({ "v6.example": [{ address, family: 6 }] });
      const s = server(reply(200));
      expect(await refusal(safeFetch("https://v6.example/", { resolve: d.resolve, transport: s.transport }))).toBe("link-blocked");
      expect(s.calls).toEqual([]);
    },
  );

  it("refuses a name when any one of its answers is private (a public answer does not excuse it)", async () => {
    for (const answers of [[PUBLIC, { address: "10.0.0.1", family: 4 as const }], [{ address: "::1", family: 6 as const }, PUBLIC]]) {
      const s = server(reply(200));
      expect(await refusal(safeFetch("https://mixed.example/", { resolve: dns({ "mixed.example": answers }).resolve, transport: s.transport }))).toBe("link-blocked");
      expect(s.calls).toEqual([]);
    }
  });

  it("says the link failed when the name does not exist, has no address, or the lookup breaks", async () => {
    const s = server(reply(200));
    const d = dns({ "empty.example": [], "broken.example": new Error("ESERVFAIL at 10.0.0.2") });
    for (const host of ["gone.example", "empty.example", "broken.example"]) {
      expect(await refusal(safeFetch(`https://${host}/`, { resolve: d.resolve, transport: s.transport }))).toBe("link-failed");
    }
    expect(s.calls).toEqual([]);
  });

  it("connects to the address it checked, with the original name, and asks DNS once for the hop", async () => {
    const d = dns({ "www.bseindia.com": [PUBLIC] });
    const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
    await safeFetch("https://www.bseindia.com/a?b=1", { resolve: d.resolve, transport: s.transport });
    expect(d.asked).toEqual(["www.bseindia.com"]);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].addresses[0]).toEqual(PUBLIC);
    expect(s.calls[0].url.hostname).toBe("www.bseindia.com");
    expect(s.calls[0].url.search).toBe("?b=1");
  });

  it("hands over every checked address, IPv4 first, so a host without working IPv6 still connects", async () => {
    const v6: Address = { address: "2606:2800:220:1::1", family: 6 };
    const v4b: Address = { address: "93.184.216.35", family: 4 };
    const s = server(reply(200, {}, [enc("ok")]));
    await safeFetch("https://dual.example/", { resolve: dns({ "dual.example": [v6, PUBLIC, v4b] }).resolve, transport: s.transport });
    expect(s.calls[0].addresses).toEqual([PUBLIC, v4b, v6]);
  });

  it("DNS rebinding: a name that answers public once and private afterwards is connected to the public answer, and never asked twice", async () => {
    const answers: Address[][] = [[PUBLIC], [{ address: "127.0.0.1", family: 4 }], [{ address: "169.254.169.254", family: 4 }]];
    let asks = 0;
    const resolve: Resolver = async () => answers[Math.min(asks++, answers.length - 1)];
    const s = server(reply(200, { "content-type": "text/plain" }, [enc("ok")]));
    await safeFetch("https://rebind.example/", { resolve, transport: s.transport });
    expect(asks).toBe(1);
    expect(s.calls.map((c) => c.addresses[0].address)).toEqual(["93.184.216.34"]);
  });

  it("the transport is handed the vetted addresses and no name to look up: its request has no cookie, header or resolver slot", async () => {
    const s = server(reply(200, {}, [enc("ok")]));
    await safeFetch("https://example.com/", { resolve: dns({ "example.com": [PUBLIC] }).resolve, transport: s.transport });
    expect(Object.keys(s.calls[0]).sort()).toEqual(["addresses", "signal", "url"]);
  });
});

