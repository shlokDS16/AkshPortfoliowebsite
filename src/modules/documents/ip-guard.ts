// Which addresses the link fetch refuses (Plan 2b Task 5, ruling R10). Pure: no I/O. Anything that is not a plain IPv4 or
// IPv6 address is refused too, so a parser difference can only ever refuse, never allow.

/** [first address, prefix length]. */
const V4_RANGES: readonly [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT (also Alibaba's metadata address)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local: cloud metadata (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and 255.255.255.255
];

function parseV4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    // Plain decimal only: "01", "0x7f" and "-1" are refused, since libraries disagree about what they mean.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

const sameBlock = (value: number, first: number, bits: number): boolean => Math.floor(value / 2 ** (32 - bits)) === Math.floor(first / 2 ** (32 - bits));
const V4_NUMERIC = V4_RANGES.map(([first, bits]) => [parseV4(first) as number, bits] as const);
const blockedV4 = (value: number): boolean => V4_NUMERIC.some(([first, bits]) => sameBlock(value, first, bits));

/** Eight 16-bit groups, or null. Handles "::" and a dotted IPv4 tail; refuses zone ids and brackets. */
function parseV6(text: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (side: string): number[] | null => {
    if (side === "") return [];
    const out: number[] = [];
    const items = side.split(":");
    for (const [i, item] of items.entries()) {
      if (item.includes(".")) {
        if (i !== items.length - 1) return null;
        const v4 = parseV4(item);
        if (v4 === null) return null;
        out.push(Math.floor(v4 / 65_536), v4 % 65_536);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(item)) return null;
        out.push(parseInt(item, 16));
      }
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...Array<number>(missing).fill(0), ...tail] : null;
}

const v4Of = (high: number, low: number): number => high * 65_536 + low;

function blockedV6(g: number[]): boolean {
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(5) && g[5] === 0xffff) return blockedV4(v4Of(g[6], g[7])); // ::ffff:0:0/96, judged as its IPv4
  if (zeroUpTo(6)) return true; // ::/96: the unspecified address, ::1 and the old IPv4-compatible form
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return true; // ::ffff:0:0:0/96 SIIT translated IPv4
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // 64:ff9b::/96 and 64:ff9b:1::/48 NAT64
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return true; // 2001:db8::/32 documentation, 2001::/32 Teredo
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // 100::/64 discard-only
  if (g[0] === 0x2002) return blockedV4(v4Of(g[1], g[2])); // 2002::/16 6to4: judged as the IPv4 it carries
  return false;
}

/** True when the address must not be fetched. An unreadable address is refused. */
export function isBlockedAddress(address: string): boolean {
  if (address.includes(":")) {
    const groups = parseV6(address);
    return groups === null || blockedV6(groups);
  }
  const v4 = parseV4(address);
  return v4 === null || blockedV4(v4);
}
