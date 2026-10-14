import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventForm } from "@/components/desk/private/ledger/event-form";
import { createFakeLedgerRepo } from "@/test/fixtures/ledger-repo";
import { buildIdeaPage } from "@/modules/ledger";
import { closedIdea, event, idea, score } from "@/test/fixtures/ledger";

const IDEA = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ repo: null as unknown, notFound: 0 }));

vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFound += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/modules/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/ledger")>()),
  getIdeaPage: (_db: unknown, id: string) => buildIdeaPage(state.repo as never, id, new Date("2026-10-13T06:00:00.000Z")),
}));
vi.mock("@/modules/ledger/actions", () => ({ addIdeaEventAction: vi.fn() }));

import IdeaPage from "./page";

const run = async (params: { ideaId: string }, search: { error?: string; notice?: string } = {}) =>
  IdeaPage({ params: Promise.resolve(params), searchParams: Promise.resolve(search) });
const html = async (...args: Parameters<typeof run>) => renderToStaticMarkup(await run(...args));

/** The element of a given component type anywhere in a returned React tree. */
function find(node: ReactNode, type: unknown): ReactElement<{ children?: ReactNode }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  return node.type === type ? node : find(node.props.children, type);
}

const open = () => idea({ id: IDEA, companyName: "Acme Ltd" });
const entries = (n = 1) =>
  Array.from({ length: n }, (_, i) => event({ id: `e${i}`, ideaId: IDEA, seq: i + 1, kind: i === 0 ? "open" : "note", bodyMd: i === 0 ? "My thesis." : `Note ${i}.` }));

beforeEach(() => {
  state.notFound = 0;
});

describe("the idea page", () => {
  it("is a 404 for an id that is not an id, and for an idea that is not there", async () => {
    state.repo = createFakeLedgerRepo({ ideas: [open()], events: entries() });
    await expect(run({ ideaId: "../../etc" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(run({ ideaId: "44444444-4444-4444-8444-444444444444" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFound).toBe(2);
  });

  it("says a waiting idea's headline once, not in the status line as well as in the score block", async () => {
    state.repo = createFakeLedgerRepo({ ideas: [open()], events: entries() });
    const markup = await html({ ideaId: IDEA });
    expect(markup).toContain("Entry will be set at the next close.");
    expect(markup.split("Entry will be set at the next close.")).toHaveLength(2);
  });

  it("gives the entry form a new key after each saved entry, so it remounts empty", async () => {
    state.repo = createFakeLedgerRepo({ ideas: [open()], events: entries(1) });
    const first = find(await run({ ideaId: IDEA }), EventForm);
    state.repo = createFakeLedgerRepo({ ideas: [open()], events: entries(2) });
    const second = find(await run({ ideaId: IDEA }), EventForm);
    expect(first?.key).not.toBeNull();
    expect(first?.key).not.toBe(second?.key);
  });

  it("announces a saved entry politely (role=status) and a refusal as an alert", async () => {
    state.repo = createFakeLedgerRepo({ ideas: [open()], events: entries() });
    expect(await html({ ideaId: IDEA }, { notice: "entry-added" })).toMatch(/role="status"[^>]*>[^<]*\S/);
    expect(await html({ ideaId: IDEA }, { error: "ledger-not-open" })).toMatch(/role="alert"/);
  });

  it("offers a closed idea only the lesson, a withdrawn one nothing", async () => {
    state.repo = createFakeLedgerRepo({ ideas: [closedIdea({ id: IDEA, processCall: null })], events: entries(), scores: [score({ ideaId: IDEA })] });
    const closed = await html({ ideaId: IDEA });
    expect(closed).toContain("Write what I learned");
    expect(closed).not.toContain("Close this idea");
    state.repo = createFakeLedgerRepo({ ideas: [idea({ id: IDEA, status: "void" })], events: entries() });
    const withdrawn = await html({ ideaId: IDEA });
    expect(withdrawn).toContain("nothing more can be added to it");
    expect(withdrawn).not.toContain("Add to this idea</a>");
  });

  it("shows his words as text, not as markup", async () => {
    state.repo = createFakeLedgerRepo({ ideas: [open()], events: [event({ id: "e0", ideaId: IDEA, seq: 1, kind: "open", bodyMd: "<img src=x onerror=alert(1)> **bold**" })] });
    const markup = await html({ ideaId: IDEA });
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt; **bold**");
    expect(markup).not.toContain("<img");
  });
});
