import { describe, expect, it } from "vitest";
import { formTicketOk, MAX_FORM_AGE_MS, MIN_FILL_MS, signFormTicket } from "./letters-form";

const SECRET = "s".repeat(40);
const NOW = Date.parse("2026-10-16T05:00:00Z");

describe("the sign-up form's render-time ticket (spec s8.5: at least 3 s after render, signed)", () => {
  it("is accepted after the minimum time and before the maximum", () => {
    const ticket = signFormTicket(SECRET, NOW);
    expect(formTicketOk(SECRET, ticket, NOW + MIN_FILL_MS)).toBe(true);
    expect(formTicketOk(SECRET, ticket, NOW + 60_000)).toBe(true);
    expect(formTicketOk(SECRET, ticket, NOW + MAX_FORM_AGE_MS)).toBe(true);
  });

  it("is refused under 3 seconds, after the maximum age, or from the future", () => {
    const ticket = signFormTicket(SECRET, NOW);
    expect(formTicketOk(SECRET, ticket, NOW + MIN_FILL_MS - 1)).toBe(false);
    expect(formTicketOk(SECRET, ticket, NOW)).toBe(false);
    expect(formTicketOk(SECRET, ticket, NOW + MAX_FORM_AGE_MS + 1)).toBe(false);
    expect(formTicketOk(SECRET, ticket, NOW - 10_000)).toBe(false);
  });

  it("is refused when the time is forged, the signature is wrong, or it is signed with another key", () => {
    const ticket = signFormTicket(SECRET, NOW);
    const [time, mac] = ticket.split(".") as [string, string];
    expect(formTicketOk(SECRET, `${NOW - 3_600_000}.${mac}`, NOW + 10_000)).toBe(false);
    expect(formTicketOk(SECRET, `${time}.${"0".repeat(mac.length)}`, NOW + 10_000)).toBe(false);
    expect(formTicketOk("o".repeat(40), ticket, NOW + 10_000)).toBe(false);
  });

  it("is refused for anything that is not a ticket, whatever it is", () => {
    for (const bad of [undefined, null, 5, {}, "", "abc", ".", "1.2.3", `${NOW}.`, `.${"a".repeat(64)}`, "NaN.abc", `${NOW}.zz`, "x".repeat(5000)]) {
      expect(formTicketOk(SECRET, bad, NOW + 10_000), String(bad)).toBe(false);
    }
  });

  it("does not use the secret as the signature: the same time under two keys differs", () => {
    expect(signFormTicket(SECRET, NOW)).not.toBe(signFormTicket("o".repeat(40), NOW));
    expect(signFormTicket(SECRET, NOW)).not.toContain(SECRET);
  });
});
