// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/modules/ledger/actions";
import { UPLOAD_LIMITS, UPLOAD_REFUSALS, buildClosesView, lessonLines } from "@/modules/ledger/client";
import { UPLOAD_REFUSAL_TEXT, uploadRefusalText } from "@/lib/messages-closes";
import { event, closedIdea, idea } from "@/test/fixtures/ledger";
import { ActionForm } from "./action-form";
import { CloseForm } from "./close-form";
import { ClosesCurrent, ClosesDays } from "./closes-days";
import { HandCloses, RestatedScores } from "./closes-hand";
import { CorporateActions } from "./corporate-actions";
import { FetchCloses, type FetchState } from "./fetch-closes";
import { JournalList } from "./journal-list";
import { NseDrop } from "./nse-drop";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const FORBIDDEN = /cannot be altered|cannot be edited|tamper|unaltered|\bproves?\b|\bproof\b|\bverified\b|ahead of the nifty|beat the nifty|\bbuy\b|\bsell\b|recommend/i;
const ACME = { id: "11111111-1111-4111-8111-111111111111", name: "Acme Ltd", symbol: "ACME", needsReview: false };
const BETA = { id: "22222222-2222-4222-8222-222222222222", name: "Beta Ltd", symbol: "BETA", needsReview: false };
const TODAY = "2026-10-14";

const view = (over: Partial<Parameters<typeof buildClosesView>[0]> = {}) =>
  buildClosesView({
    today: TODAY, days: [], closes: [], ideas: [idea({ id: "a", companyId: ACME.id, companyName: ACME.name, symbol: "ACME", openedAt: "2026-10-01T05:00:00.000Z" })],
    scores: [], actions: [], changes: [], companies: [ACME, BETA], ...over,
  });

describe("ClosesCurrent", () => {
  it("says how current the closes are, and each daily step's last run in its own words", () => {
    render(
      <ClosesCurrent
        status={{ latestOpenDay: "2026-10-12", latestOfficialDay: "2026-10-12", handEnteredDays: 2 }}
        runs={[
          { job: "ledger:prices", ranAt: "2026-10-14T03:30:00.000Z", ok: false, detail: "NSE refused; closes to 2026-10-09" },
          { job: "ledger:score", ranAt: null, ok: null },
        ]}
      />,
    );
    expect(screen.getByTestId("closes-line")).toHaveTextContent("Closes to 12 Oct 2026. 2 days rest on closes entered or dropped by hand.");
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/NSE refused; closes to 2026-10-09/)).toBeInTheDocument();
    expect(screen.getByText("Scores").closest("li")).toHaveTextContent("has not run yet");
  });

  it("says so when the status could not be read, and shows no runs list when they could not be read", () => {
    render(<ClosesCurrent status={null} runs={null} />);
    expect(screen.getByTestId("closes-line")).toHaveTextContent("Could not read how current the closes are.");
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("ClosesDays", () => {
  const days = [
    { tradeDate: "2026-10-12", status: "open" as const, source: "nse_upload" },
    { tradeDate: "2026-10-13", status: "shut" as const, source: "nse_fetch" },
    { tradeDate: "2026-10-09", status: "open" as const, source: "manual" },
  ];

  it("shows each state in words with its source, never by colour alone", () => {
    render(<ClosesDays days={view({ days }).days} />);
    const row = (date: string) => document.querySelector(`[data-day="${date}"]`) as HTMLElement;
    expect(row("2026-10-12")).toHaveTextContent("Open: NSE's official file, dropped by you");
    expect(row("2026-10-09")).toHaveTextContent("Open: a close you typed");
    expect(row("2026-10-13")).toHaveTextContent("Shut: no trading");
    expect(row("2026-10-14")).toHaveTextContent("Today: NSE publishes its file after the close");
    expect(row("2026-10-08")).toHaveTextContent("Not decided yet");
    expect(row("2026-10-08")).toHaveTextContent("marked shut only when NSE has no file for it and a later day is open");
  });

  it("names the tracked companies that have no close for an open day, and says when every company has one", () => {
    const withClose = view({ days, closes: [{ companyId: ACME.id, tradeDate: "2026-10-12", close: 100, source: "nse_upload" }] });
    const { unmount } = render(<ClosesDays days={withClose.days} />);
    expect(within(document.querySelector('[data-day="2026-10-12"]') as HTMLElement).getByTestId("missing")).toHaveTextContent("Every company you track has a close.");
    expect(within(document.querySelector('[data-day="2026-10-09"]') as HTMLElement).getByTestId("missing")).toHaveTextContent("No close yet for Acme Ltd.");
    unmount();
    const many = view({
      days,
      ideas: ["A", "B", "C", "D", "E"].map((n) => idea({ id: n, companyId: `c${n}`, companyName: `Name ${n}`, openedAt: "2026-10-01T05:00:00.000Z" })),
    });
    render(<ClosesDays days={many.days} />);
    expect(screen.getAllByTestId("missing")[0]).toHaveTextContent("No close yet for Name A, Name B, Name C and 2 others.");
  });

  it("a shut day lists nobody as missing", () => {
    render(<ClosesDays days={view({ days }).days} />);
    expect(within(document.querySelector('[data-day="2026-10-13"]') as HTMLElement).queryByTestId("missing")).toBeNull();
  });
});

describe("FetchCloses", () => {
  const done: FetchState = {
    error: null,
    steps: [
      { job: "ledger:prices", label: "Closing prices", ok: true, detail: "stored 2 dates, 4 closes" },
      { job: "ledger:score", label: "Scores", ok: false, detail: "the ledger failed its own check (chain_broken); nothing was scored" },
    ],
  };

  it("runs the action once on a press and shows each step's own result, a failure said as a failure", async () => {
    const action = vi.fn(async () => done);
    render(<FetchCloses action={action} />);
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Fetch closes now" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Fetch closes now" }));
    const result = await screen.findByTestId("fetch-result");
    expect(action).toHaveBeenCalledTimes(1);
    expect(result).toHaveTextContent("Closing prices: stored 2 dates, 4 closes");
    expect(result).toHaveTextContent("Scores: failed. the ledger failed its own check (chain_broken); nothing was scored");
    expect(result.textContent).not.toMatch(/anchor|public copy/i);
  });

  it("two presses in one moment send one request, and the button is aria-disabled (not disabled) while it runs", async () => {
    let release: (s: FetchState) => void = () => {};
    const action = vi.fn(() => new Promise<FetchState>((resolve) => (release = resolve)));
    render(<FetchCloses action={action} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fetch closes now" })).toBeEnabled());
    const button = screen.getByRole("button", { name: "Fetch closes now" });
    button.click();
    button.click();
    await waitFor(() => expect(screen.getByRole("button", { name: "Fetching..." })).toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByRole("button", { name: "Fetching..." })).not.toBeDisabled();
    expect(action).toHaveBeenCalledTimes(1);
    release(done);
    await screen.findByTestId("fetch-result");
  });

  it("an 'already running' answer is said in words and focused", async () => {
    render(<FetchCloses action={vi.fn(async () => ({ error: "ledger-fetch-busy" as const, steps: null }))} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Fetch closes now" })).toBeEnabled());
    await userEvent.setup().click(screen.getByRole("button", { name: "Fetch closes now" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("A fetch is already running.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.queryByTestId("fetch-result")).toBeNull();
  });
});

describe("NseDrop", () => {
  const send = async (files: { zip?: File | null; index?: File | null; date?: string } = {}) => {
    const user = userEvent.setup();
    render(<NseDrop today={TODAY} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Store the official closes" })).toBeEnabled());
    const date = screen.getByLabelText("Trading date of the files");
    await user.type(date, files.date ?? "2026-10-12");
    if (files.zip !== null) await user.upload(screen.getByLabelText(/Equity file/), files.zip ?? new File(["PK"], "BhavCopy.csv.zip", { type: "application/zip" }));
    if (files.index) await user.upload(screen.getByLabelText(/Index file/), files.index);
    // jsdom does not count a file given to user.upload as satisfying `required`, so the form is submitted as the page's code sees it.
    fireEvent.submit(screen.getByLabelText("Trading date of the files").closest("form") as HTMLFormElement);
    return user;
  };
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  beforeEach(() => {
    refresh.mockClear();
    vi.unstubAllGlobals();
  });

  it("posts the date and both files as a form to the owner-only route", async () => {
    const fetchMock = answer(200, { ok: true, tradeDate: "2026-10-12", stored: 2, tracked: 3, indexStored: true, scored: 2 });
    vi.stubGlobal("fetch", fetchMock);
    await send({ index: new File(["a,b"], "ind.csv", { type: "text/csv" }) });
    const result = await screen.findByTestId("drop-result");
    await waitFor(() => expect(result).toHaveTextContent("Stored 2 closes for 12 Oct 2026 as NSE's official file, dropped by you."));
    expect(result).toHaveTextContent("The Nifty 50 close is stored, so the day is open.");
    expect(result).toHaveTextContent("1 company you track had no row in the file.");
    expect(result).toHaveTextContent("Scored 2 ideas.");
    expect(result).toHaveAttribute("role", "status");
    expect(refresh).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/desk/ledger/closes/upload");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect([...body.keys()].sort()).toEqual(["bhavcopy", "date", "index"]);
    expect(body.get("date")).toBe("2026-10-12");
  });

  it.each(UPLOAD_REFUSALS)("says the refusal %s in its plain words, as an alert, and refreshes nothing", async (code) => {
    vi.stubGlobal("fetch", answer(422, { ok: false, code }));
    await send();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent(uploadRefusalText(code)));
    expect(alert.textContent!.length).toBeGreaterThan(20);
    expect(alert.textContent).not.toMatch(/\bat \S+\.(ts|js)|Error:|undefined|\[object|ZipError|CsvError|P0001|ledger:/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("every refusal ends by saying nothing was stored, and a bad close says that typing it by hand is the way through", () => {
    for (const [code, text] of Object.entries(UPLOAD_REFUSAL_TEXT)) {
      expect(text, code).toMatch(/nothing was stored\./i);
    }
    expect(UPLOAD_REFUSAL_TEXT.bad_close).toMatch(/whole file was refused/);
    expect(UPLOAD_REFUSAL_TEXT.bad_close).toMatch(/type that close by hand/);
    expect(UPLOAD_REFUSAL_TEXT.bad_close).toMatch(/stored as typed/);
    expect(UPLOAD_REFUSAL_TEXT.day_shut).toMatch(/index file/);
  });

  it("a file for another date says which date it is for", async () => {
    vi.stubGlobal("fetch", answer(422, { ok: false, code: "wrong_date", fileDate: "2026-10-09" }));
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("The equity file is for 9 Oct 2026, not the date you chose. Nothing was stored.");
  });

  it("turns a file over its limit away before sending it, stating the limit", async () => {
    const fetchMock = answer(200, {});
    vi.stubGlobal("fetch", fetchMock);
    const big = new File([new Uint8Array(UPLOAD_LIMITS.zipBytes + 1)], "huge.zip", { type: "application/zip" });
    await send({ zip: big });
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 2.5 MB");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Limits: the equity zip up to 2 MB, the index file up to 512 KB, both together up to 2.5 MB/)).toBeInTheDocument();
  });

  it("a signed-out answer, an answer that is not JSON and a network failure each read as plain words", async () => {
    vi.stubGlobal("fetch", answer(401, { ok: false, error: "not-signed-in" }));
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("You are signed out.");
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 502 })));
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not store them just now");
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not store them just now");
  });

  it("an unknown code from the route is 'could not store', never echoed", async () => {
    vi.stubGlobal("fetch", answer(422, { ok: false, code: "<script>alert(1)</script>" }));
    await send();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("script");
  });

  it("two presses send one request", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    await send();
    fireEvent.submit(screen.getByLabelText("Trading date of the files").closest("form") as HTMLFormElement);
    fireEvent.submit(screen.getByLabelText("Trading date of the files").closest("form") as HTMLFormElement);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ ok: false, code: "not_zip" }), { status: 422 }));
    await screen.findByRole("alert");
  });

  it("every control is labelled; the date cannot be later than today", async () => {
    render(<NseDrop today={TODAY} />);
    for (const label of ["Trading date of the files", /Equity file/, /Index file/]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText("Trading date of the files")).toHaveAttribute("max", TODAY);
    expect(screen.getByLabelText(/Equity file/)).toBeRequired();
    expect(screen.getByLabelText(/Index file/)).not.toBeRequired();
  });
});

describe("CloseForm", () => {
  const companies = [ACME, BETA];
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => expect(screen.getByRole("button", { name: "Store the close" })).toBeEnabled());
    await user.selectOptions(screen.getByLabelText("Company"), ACME.id);
    await user.type(screen.getByLabelText("Trading date"), "2026-10-12");
    await user.type(screen.getByLabelText("Closing price of the company"), "1234.50");
  };

  it("sends the company, the day and the close, and no source or status of any kind", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: null }));
    render(<CloseForm companies={companies} today={TODAY} action={action} />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Store the close" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(data.entries())).toEqual({ companyId: ACME.id, date: "2026-10-12", close: "1234.50", indexClose: "" });
  });

  it.each([
    ["ledger-bad-close", "Closing price of the company"],
    ["ledger-close-too-early", "Trading date"],
    ["ledger-close-weekend", "Trading date"],
    ["ledger-day-shut", "Trading date"],
    ["ledger-no-symbol", "Company"],
  ] as const)("a %s refusal is said in words beside the form, tied to %s, with everything typed kept", async (code, label) => {
    render(<CloseForm companies={companies} today={TODAY} action={vi.fn(async () => ({ error: code }))} />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Store the close" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent!.length).toBeGreaterThan(20);
    expect(screen.getByLabelText(label).getAttribute("aria-describedby")).toContain(alert.id);
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText("Closing price of the company")).toHaveValue("1234.50");
    expect(screen.getByLabelText("Company")).toHaveValue(ACME.id);
  });

  it("says plainly that a close needs an idea when there is no company to choose", () => {
    render(<CloseForm companies={[]} today={TODAY} action={vi.fn()} />);
    expect(screen.getByText(/nothing to type a close for/)).toBeInTheDocument();
  });

  it("explains the three rules (not before 15:30, not a weekend, not a shut day) and the mark", () => {
    render(<CloseForm companies={companies} today={TODAY} action={vi.fn()} />);
    expect(screen.getByText(/marked on every score that uses it/)).toBeInTheDocument();
    expect(screen.getByText(/Not before 15:30 India on the day, not on a weekend, and not on a day marked shut/)).toBeInTheDocument();
  });
});

describe("ActionForm and CorporateActions", () => {
  const filled = async (user: ReturnType<typeof userEvent.setup>, kind = "A split") => {
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter the action" })).toBeEnabled());
    await user.selectOptions(screen.getByLabelText("Company"), ACME.id);
    await user.click(screen.getByLabelText(kind));
    await user.type(screen.getByLabelText("Ex-date"), "2026-09-01");
  };

  it("offers the four kinds by name and sends a split with its factor and note", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: null }));
    render(<ActionForm companies={[ACME]} action={action} />);
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["Split", "Bonus", "Other", "No action needed"]);
    const user = userEvent.setup();
    await filled(user, "Split");
    await user.type(screen.getByLabelText("Factor (0.001 to 1000)"), "5");
    await user.type(screen.getByLabelText(/Note, optional/), "1:5 per the filing");
    await user.click(screen.getByRole("button", { name: "Enter the action" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(data.entries())).toEqual({ companyId: ACME.id, kind: "split", exDate: "2026-09-01", factor: "5", note: "1:5 per the filing" });
  });

  it("'No action needed' takes no factor", async () => {
    render(<ActionForm companies={[ACME]} action={vi.fn()} />);
    const user = userEvent.setup();
    await filled(user, "No action needed");
    expect(screen.queryByLabelText("Factor (0.001 to 1000)")).toBeNull();
  });

  it("a correction starts from the entry it replaces, fixes the company, sends what it replaces, and says so", async () => {
    const action = vi.fn(async (): Promise<FormState> => ({ error: null }));
    const correcting = { id: "33333333-3333-4333-8333-333333333333", companyId: ACME.id, kind: "split" as const, exDate: "2026-09-01", factor: 5, note: "per filing" };
    render(<ActionForm companies={[ACME, BETA]} action={action} correcting={correcting} />);
    expect(screen.getByTestId("correcting")).toHaveTextContent("The new entry replaces it; the earlier one stays listed as replaced.");
    expect(screen.queryByLabelText("Company")).toBeNull();
    expect(screen.getByLabelText("Factor (0.001 to 1000)")).toHaveValue("5");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("button", { name: "Enter the correction" })).toBeEnabled());
    await user.clear(screen.getByLabelText("Factor (0.001 to 1000)"));
    await user.type(screen.getByLabelText("Factor (0.001 to 1000)"), "4");
    await user.click(screen.getByRole("button", { name: "Enter the correction" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(data.entries())).toMatchObject({ supersedes: correcting.id, companyId: ACME.id, factor: "4", kind: "split" });
  });

  it.each([
    ["ledger-bad-factor", "Factor (0.001 to 1000)"],
    ["ledger-bad-date", "Ex-date"],
    ["ledger-note-too-long", /Note, optional/],
    ["ledger-action-duplicate", null],
  ] as const)("a %s refusal is said in words, focused and kept with what was typed", async (code, label) => {
    render(<ActionForm companies={[ACME]} action={vi.fn(async () => ({ error: code }))} />);
    const user = userEvent.setup();
    await filled(user, "Split");
    await user.type(screen.getByLabelText("Factor (0.001 to 1000)"), "5");
    await user.click(screen.getByRole("button", { name: "Enter the action" }));
    const alert = await screen.findByRole("alert");
    if (label) expect(screen.getByLabelText(label).getAttribute("aria-describedby")).toContain(alert.id);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText("Factor (0.001 to 1000)")).toHaveValue("5");
  });

  const group = (extra: Partial<{ note: string | null }> = {}) =>
    view({
      actions: [
        { id: "a2", companyId: ACME.id, exDate: "2026-09-01", factor: 4, kind: "split", note: extra.note === undefined ? "1:4 <b>per</b> filing" : extra.note, supersedes: "a1", createdAt: "2026-09-03T05:00:00.000Z" },
        { id: "a1", companyId: ACME.id, exDate: "2026-09-01", factor: 5, kind: "split", note: null, supersedes: null, createdAt: "2026-09-02T05:00:00.000Z" },
      ],
    }).actions;

  it("lists the entry in force with a correction link, and the replaced one below it marked as replaced with no link", () => {
    const { container } = render(<CorporateActions groups={group()} />);
    const live = container.querySelector('[data-action="a2"]') as HTMLElement;
    const replaced = container.querySelector('[data-action="a1"]') as HTMLElement;
    expect(live).toHaveAttribute("data-live", "yes");
    expect(within(live).getByRole("link", { name: "Correct this entry" })).toHaveAttribute("href", "/desk/ledger/closes?correct=a2#action-form");
    expect(live).toHaveTextContent("(corrects an earlier entry)");
    expect(replaced).toHaveAttribute("data-live", "no");
    expect(replaced).toHaveTextContent("Replaced by a later entry.");
    expect(within(replaced).queryByRole("link")).toBeNull();
    expect(live.compareDocumentPosition(replaced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no edit or remove control, explains the factor in one line and says any hand-entered action in a scored period marks that score", () => {
    const { container } = render(<CorporateActions groups={group()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.textContent).toMatch(/5 for a 1:5 split \(one old share became five\)/);
    expect(container.textContent).toMatch(/Any action you enter with an ex-date from the day an idea opened to the day it is marked to marks that idea's score/);
    expect(container.textContent).toMatch(/no way to edit or remove an entry/);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("shows a note as text, not as markup", () => {
    const { container } = render(<CorporateActions groups={group()} />);
    expect(container.querySelector("[data-words] b")).toBeNull();
    expect(container.querySelector("[data-words]")).toHaveTextContent("1:4 <b>per</b> filing");
  });

  it("an empty list says so", () => {
    render(<CorporateActions groups={[]} />);
    expect(screen.getByText("No actions entered.")).toBeInTheDocument();
  });
});

describe("HandCloses and RestatedScores", () => {
  it("lists typed and dropped closes with their source, or says there are none", () => {
    const v = view({ closes: [{ companyId: ACME.id, tradeDate: "2026-10-12", close: 101.5, source: "manual" }] });
    const { unmount } = render(<HandCloses closes={v.hand} />);
    expect(document.querySelector("[data-hand]")).toHaveTextContent("Acme Ltd");
    expect(document.querySelector("[data-hand]")).toHaveTextContent("Close 101.50, a close you typed");
    unmount();
    render(<HandCloses closes={[]} />);
    expect(screen.getByText("None in the last 30 days.")).toBeInTheDocument();
  });

  it("links a restated score to its idea and says 'restated on <date>' with the figure that moved", () => {
    const v = view({
      changes: [{ id: 4, ideaId: "a", changedAt: "2026-10-13T05:00:00.000Z", changed: ["entry_close"], was: { entry_close: 100 }, became: { entry_close: 101.5 } }],
    });
    render(<RestatedScores items={v.restated} />);
    expect(screen.getByRole("link", { name: "Acme Ltd" })).toHaveAttribute("href", "/desk/ledger/a");
    expect(document.querySelector("[data-restated]")).toHaveTextContent("Acme Ltd: restated on 13 Oct 2026.");
    expect(document.querySelector("[data-restated]")).toHaveTextContent("Entry close: was 100.00, now 101.50.");
  });

  it("an empty restatement list says so", () => {
    render(<RestatedScores items={[]} />);
    expect(screen.getByText("No score has been restated in the last 30 days.")).toBeInTheDocument();
  });
});

describe("JournalList", () => {
  const ideas = [closedIdea({ id: "a", companyName: "Acme Ltd" }), closedIdea({ id: "b", companyName: "Beta Ltd" })];
  const lesson = (id: string, ideaId: string, seq: number, bodyMd: string) =>
    event({ id, ideaId, seq, kind: "review", bodyMd, recordedAt: `2026-0${seq}-10T05:00:00.000Z`, stance: { process: seq % 2 ? "flawed" : "sound", tags: ["timing", "luck"] } });

  it("lists lessons in the order given (newest first), each linking to its idea, with his words exactly as typed", () => {
    const typed = "  I sized it too big.\n\n  <b>not bold</b>  ";
    const lines = lessonLines([lesson("e2", "b", 4, typed), lesson("e1", "a", 3, "First lesson.")], ideas);
    const { container } = render(<JournalList lessons={lines} limit={25} moreHref={null} />);
    const items = [...container.querySelectorAll("[data-lesson]")];
    expect(items.map((i) => i.getAttribute("data-lesson"))).toEqual(["e2", "e1"]);
    expect(within(items[0] as HTMLElement).getByRole("link", { name: "Beta Ltd" })).toHaveAttribute("href", "/desk/ledger/b#entries");
    expect((items[0]!.querySelector("[data-words]") as HTMLElement).textContent).toBe(typed);
    expect(items[0]!.querySelector("[data-words] b")).toBeNull();
    expect(items[0]).toHaveTextContent("Tags: Timing, Luck");
    expect(items[0]).toHaveTextContent("Process was sound");
    expect(items[0]).toHaveTextContent("10 Apr 2026");
  });

  it("keeps hostile text whole and isolated, and has no chart, export or button", () => {
    const hostile = "x".repeat(10_000) + "‮evil‬";
    const { container } = render(<JournalList lessons={lessonLines([lesson("e1", "a", 3, hostile)], ideas)} limit={25} moreHref={null} />);
    const words = container.querySelector("[data-words]") as HTMLElement;
    expect(words.textContent).toBe(hostile);
    expect(words.getAttribute("dir")).toBe("auto");
    expect(words.className).toContain("[overflow-wrap:anywhere]");
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("svg, canvas, table")).toBeNull();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("pages by a window: the lessons beyond it are counted and a link leads on", () => {
    const many = Array.from({ length: 30 }, (_, i) => lesson(`e${i}`, "a", (i % 9) + 1, `Lesson ${i}`));
    render(<JournalList lessons={lessonLines(many, ideas)} limit={25} moreHref="/desk/ledger/journal?lessons=50" />);
    expect(document.querySelectorAll("[data-lesson]")).toHaveLength(25);
    expect(screen.getByText(/5 more lessons not shown\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show more" })).toHaveAttribute("href", "/desk/ledger/journal?lessons=50");
  });

  it("an empty journal says how a lesson gets here", () => {
    render(<JournalList lessons={[]} limit={25} moreHref={null} />);
    expect(screen.getByText(/No lessons yet\. When you close an idea, write what you learned/)).toBeInTheDocument();
  });
});
