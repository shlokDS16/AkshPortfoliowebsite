import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const loadEditor = vi.fn();
vi.mock("./load", () => ({ loadEditor: (...a: unknown[]) => loadEditor(...a) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/modules/casefile/actions", () => ({ setFiguresToAction: vi.fn(), saveCaseFileRevisionAction: vi.fn() }));
vi.mock("@/modules/cases/actions", () => ({ refreshCaseStudyAction: vi.fn() }));
vi.mock("@/modules/catalog/actions", () => ({ makeCompanyPublicAction: vi.fn(), makeConceptPublicAction: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ unstageAction: vi.fn() }));
vi.mock("@/modules/compliance/actions", () => ({ publishCheckedAction: vi.fn(), unpublishItemAction: vi.fn() }));
vi.mock("@/modules/knowledge/actions", () => ({ saveConceptsAction: vi.fn() }));
// The pieces this page only places; each has its own tests.
const stub = await vi.hoisted(async () => {
  const { createElement } = await import("react");
  return (name: string) => () => createElement("div", { "data-stub": name });
});
vi.mock("@/components/desk/private/body-preview", () => ({ BodyPreview: stub("body-preview") }));
vi.mock("@/components/desk/private/doc-pane/doc-layout", () => ({ DocLayout: ({ gate, children }: { gate: ReactNode; children: ReactNode }) => createElement("div", null, children, gate) }));
vi.mock("@/components/desk/private/doc-pane/workspace", () => ({ DocWorkspace: ({ children }: { children: ReactNode }) => createElement("div", null, children), OpenDocumentButton: stub("open") }));
vi.mock("@/components/desk/private/figures-to-hint", () => ({ FiguresToHint: stub("figures") }));
vi.mock("@/components/desk/private/focus-on-hash", () => ({ FocusOnHash: stub("focus") }));
vi.mock("@/components/desk/private/gate-decision", () => ({ GateDecisionPanel: stub("gate-decision") }));
vi.mock("@/components/desk/private/history", () => ({ History: stub("history") }));
vi.mock("@/components/desk/private/case/ledger-record-panel", () => ({ LedgerRecordPanel: stub("ledger") }));
vi.mock("@/components/desk/private/revision-editor", () => ({ RevisionEditor: stub("editor") }));
vi.mock("@/components/desk/private/wording-guide", () => ({ WordingGuide: stub("wording") }));
vi.mock("./meta-form", () => ({ MetaForm: stub("meta") }));
vi.mock("@/components/desk/private/publish-checklist", () => ({
  PublishChecklist: ({ concepts }: { concepts?: { name: string }[] }) => createElement("div", { "data-stub": "checklist" }, (concepts ?? []).map((c) => c.name).join("|")),
}));
vi.mock("@/components/desk/private/concepts/item-concepts", () => ({
  ItemConcepts: ({ linked, blocked }: { linked: { name: string }[]; blocked: boolean }) =>
    createElement("div", { "data-stub": "concepts", "data-blocked": String(blocked) }, linked.map((c) => c.name).join("|")),
}));

import ItemPage from "./page";

const ref = (id: string, name: string, status: "private" | "public" | "unchecked") => ({ id, slug: id, name, status });
function data(over: Record<string, unknown> = {}) {
  return {
    item: { id: "11111111-1111-4111-8111-111111111111", kind: "learning", title: "T", visibility: "private", companyId: null, themeId: null, dataAsOf: null },
    revisions: [],
    current: null,
    pending: [],
    latest: { id: "r1" },
    candidate: { id: "r1", revNo: 1 },
    isFile: false,
    isLedger: false,
    ledgerRecord: null,
    ledgerStatus: null,
    concepts: { linked: [ref("a", "Moats", "private"), ref("b", "Rates", "public"), ref("c", "Stubby", "unchecked")], screened: [] },
    company: null,
    documents: [],
    staged: [],
    stagedReadings: [],
    provenance: {},
    preview: { items: [], rule4Needed: false },
    decision: null,
    decisionRevNo: null,
    body: null,
    sheet: null,
    latestFigure: null,
    model: null,
    ...over,
  };
}
const render = async () => renderToStaticMarkup(await ItemPage({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }), searchParams: Promise.resolve({}) }));

describe("the item page, concepts (Phase 4)", () => {
  it("shows the Concepts row and puts only the concepts that are not public on the checklist", async () => {
    loadEditor.mockResolvedValueOnce(data());
    const html = await render();
    expect(html).toContain('data-stub="concepts"');
    expect(html).toContain("Moats|Rates|Stubby");
    expect(html).toContain('data-stub="checklist">Moats|Stubby<');
  });

  it("a read has the private line and no publish panel", async () => {
    loadEditor.mockResolvedValueOnce(data({ item: { ...data().item, kind: "reading_note" }, candidate: null, preview: null }));
    const html = await render();
    expect(html).toContain("A read stays private. It is not published.");
    expect(html).not.toContain('data-stub="checklist"');
    expect(html).not.toContain('data-stub="gate-decision"');
    expect(html).toContain('data-stub="concepts"');
  });

  it("a revision waiting for the gate turns the picker's Save off", async () => {
    loadEditor.mockResolvedValueOnce(data({ item: { ...data().item, visibility: "public" }, pending: [{ id: "r2" }], current: { id: "r1", revNo: 1 } }));
    expect(await render()).toContain('data-blocked="true"');
  });

  it("no concept data (could not be read) leaves the row out and the page still renders", async () => {
    loadEditor.mockResolvedValueOnce(data({ concepts: null }));
    const html = await render();
    expect(html).not.toContain('data-stub="concepts"');
    expect(html).toContain('data-stub="checklist"');
  });

  it("with no revision to publish (the live one is the newest) no concept lines are asked of the checklist", async () => {
    loadEditor.mockResolvedValueOnce(data({ candidate: null }));
    expect(await render()).toContain('data-stub="checklist"></div>');
  });
});
