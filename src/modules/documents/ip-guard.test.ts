import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "./ip-guard";

// Every range the link fetch refuses (ruling R10), at both edges, with a public neighbour that must pass.

describe("isBlockedAddress: IPv4", () => {
  it.each([
    ["0.0.0.0/8", "0.0.0.0", "0.255.255.255"],
    ["10.0.0.0/8", "10.0.0.1", "10.255.255.255"],
    ["100.64.0.0/10 (carrier-grade NAT)", "100.64.0.0", "100.127.255.255"],
    ["127.0.0.0/8 (loopback)", "127.0.0.1", "127.255.255.255"],
    ["169.254.0.0/16 (link-local, cloud metadata)", "169.254.169.254", "169.254.0.0"],
    ["172.16.0.0/12", "172.16.0.0", "172.31.255.255"],
    ["192.0.0.0/24", "192.0.0.0", "192.0.0.255"],
    ["192.0.2.0/24 (documentation)", "192.0.2.0", "192.0.2.255"],
    ["192.168.0.0/16", "192.168.0.1", "192.168.255.255"],
    ["198.18.0.0/15 (benchmarking)", "198.18.0.0", "198.19.255.255"],
    ["198.51.100.0/24 (documentation)", "198.51.100.7", "198.51.100.255"],
    ["203.0.113.0/24 (documentation)", "203.0.113.9", "203.0.113.255"],
    ["224.0.0.0/4 (multicast)", "224.0.0.1", "239.255.255.255"],
    ["240.0.0.0/4 (reserved)", "240.0.0.0", "255.255.255.254"],
    ["255.255.255.255 (broadcast)", "255.255.255.255", "255.255.255.255"],
  ])("refuses %s at both edges", (_range, low, high) => {
    expect(isBlockedAddress(low)).toBe(true);
    expect(isBlockedAddress(high)).toBe(true);
  });

  it.each([
    "1.1.1.1", "8.8.8.8", "9.255.255.255", "11.0.0.0", "100.63.255.255", "100.128.0.0", "126.255.255.255", "128.0.0.1",
    "169.253.255.255", "169.255.0.0", "172.15.255.255", "172.32.0.0", "192.0.1.1", "192.167.255.255", "192.169.0.0",
    "198.17.255.255", "198.20.0.0", "223.255.255.255", "93.184.216.34",
  ])("lets the public address %s through", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("isBlockedAddress: IPv6", () => {
  it.each([
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["0:0:0:0:0:0:0:1", "loopback, long form"],
    ["fc00::1", "unique local"],
    ["fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "unique local, top edge"],
    ["fe80::1", "link-local"],
    ["febf::1", "link-local, top edge"],
    ["ff02::1", "multicast"],
    ["ff00::", "multicast, bottom edge"],
    ["64:ff9b::7f00:1", "NAT64 of 127.0.0.1"],
    ["64:ff9b::808:808", "NAT64 of a public address (still refused)"],
    ["2001:db8::1", "documentation"],
    ["2001:db8:ffff::1", "documentation, inside the /32"],
    ["2001::1", "Teredo"],
    ["100::1", "discard-only"],
    ["::127.0.0.1", "IPv4-compatible loopback"],
    ["::10.0.0.1", "IPv4-compatible private"],
  ])("refuses %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    ["::ffff:127.0.0.1", "mapped loopback, dotted"],
    ["::ffff:7f00:1", "mapped loopback, hex"],
    ["::ffff:10.1.2.3", "mapped 10/8"],
    ["::ffff:a9fe:a9fe", "mapped metadata 169.254.169.254, hex"],
    ["::ffff:192.168.1.1", "mapped 192.168/16"],
    ["0:0:0:0:0:ffff:ac10:1", "mapped 172.16.0.1, long form"],
    ["2002:7f00:1::", "6to4 of 127.0.0.1"],
    ["2002:0a00:0001::1", "6to4 of 10.0.0.1"],
  ])("refuses the embedded private address in %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8", "::ffff:808:808", "2002:5db8:d822::1"])(
    "lets the public address %s through (a mapped address is judged as its IPv4)",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe("isBlockedAddress: anything it cannot read is refused", () => {
  it.each([
    "", "localhost", "example.com", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1.2.3.-4", "::g", ":::", "1::2::3",
    "fe80::1%eth0", "[::1]", "12345::", "::ffff:1.2.3", " 8.8.8.8", "8.8.8.8 ",
  ])("refuses %j", (value) => {
    expect(isBlockedAddress(value)).toBe(true);
  });
});
