import { describe, expect, it, vi } from "vitest";

const loadEditor = vi.fn();
vi.mock("./load", () => ({ loadEditor: (...a: unknown[]) => loadEditor(...a) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: vi.fn(async () => ({ email: "admin@desk.test" })) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("@/modules/casefile/actions", () => ({ setFiguresToAction: vi.fn(), saveCaseFileRevisionAction: vi.fn() }));
vi.mock("@/modules/cases/actions", () => ({ refreshCaseStudyAction: vi.fn() }));
vi.mock("@/modules/catalog/actions", () => ({ makeCompanyPublicAction: vi.fn(), makeConceptPublicAction: vi.fn() }));
vi.mock("@/modules/ingestion/actions", () => ({ unstageAction: vi.fn() }));
vi.mock("@/modules/compliance/actions", () => ({ publishCheckedAction: vi.fn(), unpublishItemAction: vi.fn() }));
vi.mock("@/modules/knowledge/actions", () => ({ saveConceptsAction: vi.fn() }));

import ItemPage from "./page";

const ID = "11111111-1111-4111-8111-111111111111";
async function target(query: Record<string, string> = {}): Promise<string> {
  try {
    await ItemPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(query) });
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1] as string;
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("a letter is shown by its own page", () => {
  it("the item page sends a letter to /desk/letters/[id] with the message it was given, so every link by id keeps working", async () => {
    loadEditor.mockResolvedValue({ item: { id: ID, kind: "letter" } });
    expect(await target()).toBe(`/desk/letters/${ID}`);
    expect(await target({ notice: "published" })).toBe(`/desk/letters/${ID}?notice=published`);
    expect(await target({ error: "letter-subject-label" })).toBe(`/desk/letters/${ID}?error=letter-subject-label`);
  });
});
