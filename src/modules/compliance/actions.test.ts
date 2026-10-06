import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/lib/supabase/errors";
import { createFakeComplianceRepo, type FakeComplianceRepo } from "@/test/fakes/compliance-repo";
import { sentenceHash } from "./hash";
import type { PublishContext } from "./repo";

const order: string[] = [];
const state = vi.hoisted(() => ({ repo: null as unknown }));
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const requireAdmin = vi.fn(async () => {
  order.push("requireAdmin");
  return { userId: "u-1", email: "aksh@example.com" };
});
const updateTag = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args), updateTag: (tag: string) => updateTag(tag) }));
vi.mock("@/modules/identity", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    order.push("client");
    return {};
  },
}));
vi.mock("./repo", () => ({ createSupabaseComplianceRepo: () => state.repo }));

import { allowSentenceAction, publishRevision, publishRevisionAction, unpublishItem, unpublishItemAction } from "./actions";

const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const context = (bodyMd: string): PublishContext => ({
  item: {
    id: ITEM,
    kind: "learning",
    title: "How Capex Cycles Turn",
    slug: null,
    learningObjective: "Recognise the late stage of a capex cycle.",
    companyId: null,
    holdsPosition: null,
    dataAsOf: null,
    visibility: "private",
  },
  revision: { id: REV, bodyMd, structured: {}, changeReason: null },
  companyName: null,
  companyOneLiner: null,
  themeName: null,
  allowances: [],
});

let repo: FakeComplianceRepo;
const form = (values: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
async function target(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1];
    throw error;
  }
  throw new Error("expected a redirect");
}
const param = (to: string, name: string) => new URL(to, "http://x").searchParams.get(name);

beforeEach(() => {
  repo = createFakeComplianceRepo(context("Utilisation peaked in 2024."));
  state.repo = repo;
  order.length = 0;
  for (const mock of [requireAdmin, redirect, updateTag, revalidatePath]) mock.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("every action checks the admin first", () => {
  it("stops before touching the database when requireAdmin redirects", async () => {
    requireAdmin.mockImplementationOnce(async () => {
      throw new Error("NEXT_REDIRECT:/login");
    });
    await expect(publishRevision(ITEM, REV)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(order).not.toContain("client");
    expect(repo.published).toHaveLength(0);
  });

  it.each([
    ["publishRevision", () => publishRevision(ITEM, REV)],
    ["unpublishItem", () => unpublishItem(ITEM)],
    ["publishRevisionAction", () => publishRevisionAction(ITEM, REV)],
    ["unpublishItemAction", () => unpublishItemAction(ITEM)],
    ["allowSentenceAction", () => allowSentenceAction(ITEM, sentenceHash("x"), form({ reason: "educational" }))],
  ])("%s calls requireAdmin before opening a database client", async (_name, run) => {
    await run().catch(() => undefined);
    expect(order[0]).toBe("requireAdmin");
  });
});

describe("ids are validated before anything is read or written", () => {
  it("rejects a malformed item or revision id", async () => {
    await expect(publishRevision("nope", REV)).rejects.toThrow(/could not be found/i);
    await expect(publishRevision(ITEM, "nope")).rejects.toThrow(/could not be found/i);
    await expect(unpublishItem("nope")).rejects.toThrow(/could not be found/i);
    expect(repo.published).toHaveLength(0);
    expect(repo.unpublished).toHaveLength(0);
  });

  it("sends the form actions to a fixed error code, not to a raw message", async () => {
    expect(param(await target(() => publishRevisionAction("nope", REV)), "error")).toBe("item-not-found");
    expect(param(await target(() => unpublishItemAction("nope")), "error")).toBe("item-not-found");
    expect(param(await target(() => allowSentenceAction("nope", sentenceHash("x"), form({ reason: "educational" }))), "error")).toBe("item-not-found");
    expect(repo.allowances).toHaveLength(0);
  });
});

describe("publishRevision", () => {
  it("purges the public caches only when the gate passes", async () => {
    const decision = await publishRevision(ITEM, REV);
    expect(decision.verdict).toBe("pass");
    expect(updateTag).toHaveBeenCalledWith("public-items");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(revalidatePath).toHaveBeenCalledWith(`/desk/items/${ITEM}`);
  });

  it("returns a failed decision without purging or raising", async () => {
    repo.context = context("You should buy the leader now.");
    const decision = await publishRevision(ITEM, REV);
    expect(decision.verdict).toBe("fail");
    expect(decision.failures.some((f) => f.rule === "1")).toBe(true);
    expect(updateTag).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(`/desk/items/${ITEM}`);
  });

  it("reports a slug collision as a failed decision, not an error", async () => {
    repo.slugTaken = true;
    const decision = await publishRevision(ITEM, REV);
    expect(decision.failures.map((f) => f.rule)).toEqual(["slug"]);
  });
});

describe("publishRevisionAction", () => {
  it("confirms a pass and opens the gate section", async () => {
    expect(await target(() => publishRevisionAction(ITEM, REV))).toBe(`/desk/items/${ITEM}?notice=published#gate`);
  });

  it("shows a failure on the gate panel, with no error banner", async () => {
    repo.context = context("You should buy the leader now.");
    expect(await target(() => publishRevisionAction(ITEM, REV))).toBe(`/desk/items/${ITEM}#gate`);
  });

  it("maps a missing revision to the not-found code", async () => {
    repo.context = null;
    expect(param(await target(() => publishRevisionAction(ITEM, randomUUID())), "error")).toBe("item-not-found");
  });

  it("never leaks a raw database error", async () => {
    vi.spyOn(repo, "callPublishRevision").mockRejectedValueOnce(new DbError("compliance.publish_revision", "XX000", 'relation "private.settings" is gone'));
    const to = await target(() => publishRevisionAction(ITEM, REV));
    expect(param(to, "error")).toBe("save-failed");
    expect(decodeURIComponent(to)).not.toMatch(/private\.settings/);
    expect(console.error).toHaveBeenCalledWith("compliance action failed", { name: "DbError", op: "compliance.publish_revision", code: "XX000" });
  });
});

describe("unpublishItem", () => {
  it("retracts through the database function and purges the public caches", async () => {
    repo.context = { ...context("x"), item: { ...context("x").item, slug: "how-capex-cycles-turn-0b6f3c" } };
    expect(await unpublishItem(ITEM)).toEqual({ slug: "how-capex-cycles-turn-0b6f3c" });
    expect(repo.unpublished).toEqual([ITEM]);
    expect(updateTag).toHaveBeenCalledWith("public-items");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("the form action confirms and returns to the item", async () => {
    expect(await target(() => unpublishItemAction(ITEM))).toBe(`/desk/items/${ITEM}?notice=unpublished`);
  });
});

describe("allowSentenceAction", () => {
  const hash = sentenceHash("Why I avoid target prices.");

  it("stores an allowance with its reason and returns to the gate", async () => {
    const to = await target(() => allowSentenceAction(ITEM, hash, form({ reason: "  Educational use of the phrase.  " })));
    expect(to).toBe(`/desk/items/${ITEM}?notice=allowance-saved#gate`);
    expect(repo.allowances).toEqual([{ itemId: ITEM, sentenceHash: hash, reason: "Educational use of the phrase." }]);
  });

  it("refuses a short reason with a fixed code and stores nothing", async () => {
    const to = await target(() => allowSentenceAction(ITEM, hash, form({ reason: "no" })));
    expect(param(to, "error")).toBe("reason-required");
    expect(repo.allowances).toHaveLength(0);
  });

  it("refuses a hash that is not a sha-256 digest", async () => {
    const to = await target(() => allowSentenceAction(ITEM, "'; drop table items; --", form({ reason: "educational" })));
    expect(param(to, "error")).toBe("invalid-input");
    expect(repo.allowances).toHaveLength(0);
  });
});
