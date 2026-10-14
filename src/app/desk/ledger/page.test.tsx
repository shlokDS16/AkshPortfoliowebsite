import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildLedgerHome } from "@/modules/ledger";
import { createFakeLedgerRepo } from "@/test/fixtures/ledger-repo";
import { idea, score } from "@/test/fixtures/ledger";

const TODAY = "2026-10-13";
const open = Array.from({ length: 160 }, (_, i) => idea({ id: `o${i}`, companyName: `Open ${i}` }));
const closed = Array.from({ length: 80 }, (_, i) => idea({ id: `c${i}`, companyName: `Closed ${i}`, status: "closed", closedAt: "2026-06-01T05:00:00.000Z", closeReason: "played_out" }));

vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/modules/ops", () => ({ createSupabaseHeartbeatRepo: () => ({ latestRuns: async () => ({}) }) }));
vi.mock("@/modules/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/ledger")>()),
  getLedgerHome: () =>
    buildLedgerHome(createFakeLedgerRepo({ ideas: [...open, ...closed], scores: [...open, ...closed].map((i) => score({ ideaId: i.id })) }), TODAY),
}));

import LedgerPage from "./page";

const links = async (search: Record<string, string>) => {
  const markup = renderToStaticMarkup(await LedgerPage({ searchParams: Promise.resolve(search) }));
  return [...markup.matchAll(/href="(\/desk\/ledger\?[^"]+)"/g)].map((m) => (m[1] as string).replace(/&amp;/g, "&"));
};

const BASE = ["/desk/ledger?open=100&closed=25#open", "/desk/ledger?open=50&closed=50#closed"];

describe("the Ledger page's paging parameters", () => {
  it("shows the base windows with no parameter, and offers the next step of each list", async () => {
    expect(await links({})).toEqual(BASE);
  });

  it.each(["abc", "-5", "1e3", "99999", "5001", "", "0x10", "24", "1.5"])("ignores a parameter of %j and uses the base window", async (raw) => {
    expect(await links({ open: raw, closed: raw })).toEqual(BASE);
  });

  it("widens by one step from a window the address names", async () => {
    expect(await links({ open: "100", closed: "50" })).toEqual(["/desk/ledger?open=150&closed=50#open", "/desk/ledger?open=100&closed=75#closed"]);
  });
});
