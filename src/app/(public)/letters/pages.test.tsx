import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_CARD } from "@/components/desk/share-card";
import { LETTERS_BOARD_SENTENCE, LETTERS_COPY, LETTERS_NOTICE, lettersNotice } from "@/modules/distribution/public";
import { letterCard } from "@/modules/showcase";
import { buildSeedSnapshot, withLetter } from "@/test/fakes/showcase-snapshot";

// Plan 5c Task 14 (spec s8.9): /letters and /letters/[slug] are a 404 until sign-ups are open or a letter is public (the deploy state), list only
// gate-passed letters, and show no reader, address or send. Confirm and leave are plain forms; a GET confirms nothing.
const state = vi.hoisted(() => ({ snapshot: null as unknown, unavailable: false, open: false, ready: true, contact: "help@desk.example" as string | null, notFound: 0, redirected: [] as string[], calls: [] as string[] }));
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
vi.mock("@/lib/letters-config", () => ({ grievanceContact: () => state.contact, lettersEmailReady: () => state.ready }));
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
  state.ready = true;
  state.contact = "help@desk.example";
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
    expect(out).toContain(lettersNotice("help@desk.example"));
    expect(out).toContain("Questions or complaints: help@desk.example.");
    expect(out).toContain(LETTERS_BOARD_SENTENCE);
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

  it("shows no form while email is not set up in this environment, and is a 404 if no letter is public (review finding 8)", async () => {
    state.snapshot = seed();
    state.open = true;
    state.ready = false;
    await expect(lettersPage()).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = world();
    const out = await html(lettersPage());
    expect(out).not.toContain("<form");
    expect(out).not.toContain(LETTERS_COPY.signupTitle);
    expect(out).toContain('href="/letters/l1-what-changed-this-fortnight"');
  });

  it("shows no form while the contact for complaints is unset (review finding 5): a notice with no route is not offered", async () => {
    state.snapshot = seed();
    state.open = true;
    state.contact = null;
    await expect(lettersPage()).rejects.toThrow("NEXT_NOT_FOUND");
    state.snapshot = world();
    const out = await html(lettersPage());
    expect(out).not.toContain("<form");
    expect(out).not.toContain(LETTERS_NOTICE);
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
