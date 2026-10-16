// A pure allowlist for the unit outbound guard (review finding 4). Nothing here touches the network or reads globals.
// A host is OUTSIDE unless it is the machine itself: no host (a relative address), localhost or any *.localhost, 127.x.x.x, ::1.
// This mirrors the e2e guard (e2e/support/outbound.ts). It is matched on the parsed host name, never as a prefix or a substring,
// so notresend.com, resend.com.evil.test and 127.0.0.1.nip.io are all outside.
const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;

export function isOutsideHost(host: string): boolean {
  let h = host.trim().toLowerCase();
  if (h.endsWith(".")) h = h.slice(0, -1);
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "") return false;
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  if (LOOPBACK_V4.test(h)) return false;
  if (h === "::1") return false;
  return true;
}
