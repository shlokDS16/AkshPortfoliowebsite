import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LETTERS_COPY } from "@/modules/distribution/public";
import { buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";

// Plan 5c Task 14 (spec s8.5, s8.9): /letters/confirm and /letters/leave are plain forms, never cached, never indexed; a GET confirms nothing; the three forms
// post to the reader's actions and end on a page that holds no address and no token.
const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false, open: false, notFound: 0, redirected: [] as string[], calls: [] as string[] }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    state.notFound += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    state.redirected.push(to);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/og", () => ({ ImageResponse: class { constructor(readonly element: { props: { c: unknown } }, readonly options: unknown) {} } }));
vi.mock("@/lib/og-fonts", () => ({ loadOgFonts: async () => [] }));
vi.mock("@/lib/letters-form", () => ({ issueFormTicket: () => "1700000000000.ticket" }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/modules/showcase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/showcase")>()),
  getSnapshot: async () => (state.unavailable ? { status: "unavailable" } : { status: "ok", data: state.snapshot }),
  getLettersOpen: async () => state.open,
}));
vi.mock("@/modules/distribution/public-actions", () => ({
  askToSubscribeAction: async (_previous: unknown, form: FormData) => void state.calls.push(`ask:${String(form.get("email"))}`),
  confirmAction: async (_previous: unknown, form: FormData) => {
    state.calls.push(`confirm:${String(form.get("token"))}`);
    return { status: form.get("token") === "good" ? "confirmed" : "expired" };
  },
  leaveAction: async (_previous: unknown, form: FormData) => void state.calls.push(`leave:${String(form.get("email"))}`),
}));

import ConfirmPage, * as confirm from "./confirm/page";
import LeavePage, * as leave from "./leave/page";
import { askForm, confirmForm, leaveForm } from "./form-actions";

const seed = () => buildSeedSnapshot();
const html = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node);

beforeEach(() => {
  state.notFound = 0;
  state.unavailable = false;
  state.open = false;
  state.redirected = [];
  state.calls = [];
});

describe("/letters/confirm", () => {
  const page = (query: Record<string, string>) => ConfirmPage({ searchParams: Promise.resolve(query) } as never);

  it("is never cached, never indexed, and does not pass its address on as a referrer", () => {
    expect(confirm.dynamic).toBe("force-dynamic");
    expect(confirm.metadata).toMatchObject({ title: LETTERS_COPY.confirmTitle, robots: { index: false, follow: false }, referrer: "no-referrer" });
  });

  it("a GET with a token shows the button and calls nothing: mail scanners open links", async () => {
    state.snapshot = seed();
    const out = await html(page({ t: "good" }));
    expect(out).toContain(LETTERS_COPY.confirmTitle);
    expect(out).toContain(LETTERS_COPY.confirmButton);
    expect(out).toContain('<input type="hidden" name="token" value="good"/>');
    expect(state.calls).toEqual([]);
  });

  it("the token is in a hidden field only, escaped, and nowhere else in the page", async () => {
    state.snapshot = seed();
    const out = await html(page({ t: 'a"><script>x</script>' }));
    expect(out).not.toContain("<script>x");
    expect(out.split("a&quot;&gt;&lt;script&gt;x&lt;/script&gt;")).toHaveLength(2);
  });

  it("without a usable token, or with one too long, it says the link has expired and shows no button", async () => {
    state.snapshot = seed();
    for (const query of [{}, { t: "" }, { t: "x".repeat(129) }] as Record<string, string>[]) {
      const out = await html(page(query));
      expect(out).toContain(LETTERS_COPY.expired);
      expect(out).not.toContain("<form");
    }
  });

  it("after a post it says the one thing that happened, with no form", async () => {
    state.snapshot = seed();
    expect(await html(page({ r: "confirmed" }))).toContain(LETTERS_COPY.confirmed);
    const expired = await html(page({ r: "expired", t: "good" }));
    expect(expired).toContain(LETTERS_COPY.expired);
    expect(expired).not.toContain("<form");
  });

  it("works with the snapshot down", async () => {
    state.unavailable = true;
    state.snapshot = seed();
    expect(await html(page({ t: "good" }))).toContain(LETTERS_COPY.confirmButton);
  });
});

describe("/letters/leave", () => {
  const page = (query: Record<string, string> = {}) => LeavePage({ searchParams: Promise.resolve(query) } as never);

  it("is never cached and never indexed", () => {
    expect(leave.dynamic).toBe("force-dynamic");
    expect(leave.metadata).toMatchObject({ title: LETTERS_COPY.leaveTitle, robots: { index: false, follow: false } });
  });

  it("is there whatever the switch says and whether or not a letter is public: one field and one button", async () => {
    state.snapshot = seed();
    state.open = false;
    const out = await html(page());
    expect(out).toContain(LETTERS_COPY.leaveTitle);
    expect(out).toContain('name="email"');
    expect(out).toContain(LETTERS_COPY.leaveButton);
    expect(state.notFound).toBe(0);
  });

  it("answers with the one sentence after a post and shows no form", async () => {
    state.snapshot = seed();
    const out = await html(page({ r: "left" }));
    expect(out).toContain(LETTERS_COPY.left);
    expect(out).not.toContain("<form");
  });
});

describe("the three plain forms post to the reader's actions and redirect to a page that holds no address and no token", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };
  const run = async (action: (data: FormData) => Promise<void>, data: FormData) => {
    await expect(action(data)).rejects.toThrow("NEXT_REDIRECT");
    return state.redirected.at(-1);
  };

  it("sign-up always ends at the same place, and the address is not in it", async () => {
    expect(await run(askForm, form({ email: "reader@example.com" }))).toBe("/letters?asked=1#subscribe");
    expect(state.calls).toEqual(["ask:reader@example.com"]);
  });

  it("confirm ends on the sentence for what happened, never on the token", async () => {
    expect(await run(confirmForm, form({ token: "good" }))).toBe("/letters/confirm?r=confirmed");
    expect(await run(confirmForm, form({ token: "stale" }))).toBe("/letters/confirm?r=expired");
    expect(state.redirected.join()).not.toMatch(/good|stale/);
  });

  it("leave ends on the same page whether or not the address was known", async () => {
    expect(await run(leaveForm, form({ email: "reader@example.com" }))).toBe("/letters/leave?r=left");
    expect(await run(leaveForm, form({ email: "nobody@example.com" }))).toBe("/letters/leave?r=left");
    expect(state.redirected.join()).not.toContain("@");
  });
});
