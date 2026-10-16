import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_CARD } from "@/components/desk/share-card";
import { LETTERS_COPY, LETTERS_NOTICE } from "@/modules/distribution/public";
import { letterCard } from "@/modules/showcase";
import { buildSeedSnapshot, withLetter } from "@/test/fakes/showcase-snapshot";

// Plan 5c Task 14 (spec s8.9): /letters and /letters/[slug] are a 404 until sign-ups are open or a letter is public (the deploy state), list only
// gate-passed letters, and show no reader, address or send. Confirm and leave are plain forms; a GET confirms nothing.
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

import LettersPage, * as index from "./page";
import LetterRoute, * as letter from "./[slug]/page";
import * as cardRoute from "./[slug]/opengraph-image";
import ConfirmPage, * as confirm from "./confirm/page";
import LeavePage, * as leave from "./leave/page";
import { askForm, confirmForm, leaveForm } from "./form-actions";

const SLUG = "l1-what-changed-this-fortnight";
const seed = () => buildSeedSnapshot();
const world = () => withLetter(seed());
const html = async (node: Promise<React.ReactNode>) => renderToStaticMarkup(await node);
const lettersPage = (query: Record<string, string> = {}) => LettersPage({ searchParams: Promise.resolve(query) } as never);
const route = (slug: string) => LetterRoute({ params: Promise.resolve({ slug }) } as never);

beforeEach(() => {
  state.notFound = 0;
  state.unavailable = false;
  state.open = false;
  state.redirected = [];
  state.calls = [];
});

describe("/letters", () => {
  it("is a 404 in the deploy state: sign-ups closed and no letter public", async () => {
    state.snapshot = seed();
    await expect(lettersPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is rendered for every request (its ticket carries the render time) and titled", () => {
    expect(index.dynamic).toBe("force-dynamic");
    expect(index.metadata).toMatchObject({ title: "Letters", alternates: { canonical: "/letters" } });
  });

  it("with sign-ups open and no letter: the notice, the form with its ticket, the trap and the empty line", async () => {
    state.snapshot = seed();
    state.open = true;
    const out = await html(lettersPage());
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain(LETTERS_COPY.signupTitle);
    expect(out).toContain(LETTERS_NOTICE);
    expect(out).toContain('name="ticket" value="1700000000000.ticket"');
    expect(out).toContain('name="email"');
    expect(out).toMatch(/<input[^>]*id="signup-adult"[^>]*>/);
    const tick = out.match(/<input[^>]*id="signup-adult"[^>]*>/)![0];
    expect(tick).toContain('name="adult"');
    expect(tick).toContain('type="checkbox"');
    expect(tick).toContain("required");
    expect(out).toContain(LETTERS_COPY.adultLabel);
    expect(out).toContain(LETTERS_COPY.ask);
    expect(out).toContain(LETTERS_COPY.empty);
    expect(out).toContain('href="/letters/leave"');
    expect(out).toContain("application/ld+json");
  });

  it("the trap is off the page, out of the tab order and hidden from assistive technology; a person has no reason to meet it", async () => {
    state.snapshot = seed();
    state.open = true;
    const out = await html(lettersPage());
    expect(out).toMatch(/<div aria-hidden="true" class="[^"]*-left-\[9999px\][^"]*"><label for="signup-website">/);
    const trap = out.match(/<input[^>]*id="signup-website"[^>]*>/)![0];
    expect(trap).toContain('name="website"');
    expect(trap).toContain('tabindex="-1"');
    expect(trap).toContain('autoComplete="off"');
  });

  it("after a post the form is replaced by the one answer; the address is nowhere in the page", async () => {
    state.snapshot = seed();
    state.open = true;
    const out = await html(lettersPage({ asked: "1" }));
    expect(out).toContain(LETTERS_COPY.asked);
    expect(out).not.toContain("<form");
    expect(out).not.toMatch(/mailto:|[\w.]+@[\w-]+\.[a-z]/i);
  });

  it("lists a public letter with his subject and sentence, links it, and with sign-ups closed shows no form", async () => {
    state.snapshot = world();
    const out = await html(lettersPage());
    expect(out).toContain('href="/letters/l1-what-changed-this-fortnight"');
    expect(out).toContain("What changed this fortnight");
    expect(out).toContain("Two pages changed and one test moved.");
    expect(out).toContain("Published 28 Sep 2026");
    expect(out).not.toContain("<form");
    expect(out).not.toContain(LETTERS_NOTICE);
  });

  it("shows no reader count, address, send time or unsubscribe placeholder", async () => {
    state.snapshot = world();
    state.open = true;
    const out = await html(lettersPage());
    expect(out.match(/.{20}(?:\{\{\{|RESEND_|readers?\b|subscribers?\b|Sent to).{20}/gi)).toBeNull();
  });

  it("says it is unavailable at build time when the snapshot is, never a 404", async () => {
    state.unavailable = true;
    state.snapshot = seed();
    expect(await html(lettersPage())).toContain("Letters");
    expect(state.notFound).toBe(0);
  });
});

describe("/letters/[slug]", () => {
  it("is a 404 for every slug in the deploy state and for an unknown slug; builds nothing ahead of time", async () => {
    state.snapshot = seed();
    await expect(route(SLUG)).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = world();
    await expect(route("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await letter.generateStaticParams()).toEqual([]);
    expect(letter.revalidate).toBe(3600);
  });

  it("is a 404 for a letter none of whose pages is public any more", async () => {
    const full = world();
    const gone = new Set(["i1", "n0"]);
    state.snapshot = { ...full, items: full.items.filter((i) => !gone.has(i.id)), revisions: full.revisions.filter((r) => !gone.has(r.itemId)) };
    await expect(route(SLUG)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the subject, his sentence, his note, the entries with their links, and the disclosure for print", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain("What changed this fortnight");
    expect(out).toContain("Two pages changed and one test moved.");
    expect(out).toContain("Two things this time.");
    expect(out).toContain("The first line of the second paragraph\nand its second line.");
    expect(out).toContain('href="/companies/kavpump"');
    expect(out).toContain("Moved the receivable days test.");
    expect(out).toContain("Revision R2 · 3 sentences changed · figures to 22 Aug 2026");
    expect(out).toContain("Position: No");
    expect(out).toContain(LETTERS_COPY.allLetters);
    expect(out).toContain("data-print-disclosure");
  });

  it("prints: the masthead names the address and the revision, and the standard disclosure is there for the paper copy", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    expect(out).toContain("data-print-masthead");
    expect(out).toContain("This copy shows revision R1 of 28 Sep 2026.");
    expect(out).toContain("https://desk.example/letters/l1-what-changed-this-fortnight");
    expect(out).toContain("data-print-disclosure");
  });

  it("has no unsubscribe placeholder, no unsubscribe link, no reader count, no send time and no form", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    expect(out).not.toMatch(/\{\{\{|RESEND|unsubscribe|Sent to|subscribers?\b|<form/i);
  });

  it("puts one JSON-LD Article in the page that parses, and names a canonical address and its masthead address", async () => {
    state.snapshot = world();
    const out = await html(route(SLUG));
    const scripts = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect((JSON.parse(scripts[0][1]) as { "@type": string }[]).map((n) => n["@type"])).toEqual(["Article", "BreadcrumbList"]);
    expect(out).toContain("https://desk.example/letters/l1-what-changed-this-fortnight");
    const meta = await letter.generateMetadata({ params: Promise.resolve({ slug: SLUG }) } as never);
    expect(meta.alternates?.canonical).toBe(`/letters/${SLUG}`);
  });
});

describe("the letter share card", () => {
  const run = async (slug: string) => (await cardRoute.default({ params: Promise.resolve({ slug }) })) as unknown as { element: { props: { c: unknown } } };

  it("is 1200 by 630 PNG, regenerated hourly with the page, and builds nothing ahead of time", async () => {
    expect(cardRoute.size).toEqual({ width: 1200, height: 630 });
    expect(cardRoute.contentType).toBe("image/png");
    expect(cardRoute.revalidate).toBe(3600);
    expect(await cardRoute.generateStaticParams()).toEqual([]);
  });

  it("draws the card the builder gives, the site card with the snapshot down, and a 404 where the page is one", async () => {
    state.snapshot = world();
    expect((await run(SLUG)).element.props.c).toEqual(letterCard(world(), SLUG));
    expect(((await cardRoute.default({ params: Promise.resolve({ slug: "nope" }) })) as Response).status).toBe(404);
    state.snapshot = seed();
    expect(((await cardRoute.default({ params: Promise.resolve({ slug: SLUG }) })) as Response).status).toBe(404);
    state.unavailable = true;
    expect((await run(SLUG)).element.props.c).toEqual(HOME_CARD);
  });
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
