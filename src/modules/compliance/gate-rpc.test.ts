import { describe, expect, it, vi } from "vitest";
import { AccessDeniedError, ItemNotFoundError } from "@/lib/errors";
import { DbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => {
    throw new Error("tests pass their own client");
  },
}));

import { createGateRpc } from "./gate-rpc";

const ACTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const ITEM = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const REV = "7e8d9c0b-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const HASH = "a".repeat(64);

function fakeDb(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { db: { rpc } as unknown as Db, rpc };
}

describe("createGateRpc (ADR-003: the only non-job use of the secret-key client)", () => {
  it("publishes with the verified admin as p_actor and returns the decision row", async () => {
    const row = { id: "g-1", item_id: ITEM, revision_id: REV, verdict: "pass", policy_version: "p", decided_at: "t", reasons: {}, created_at: "t" };
    const { db, rpc } = fakeDb({ data: row, error: null });
    const decision = await createGateRpc(db).callPublishRevision({ actorId: ACTOR, itemId: ITEM, revisionId: REV, policyVersion: "p", lintResult: { passed: true } });
    expect(rpc).toHaveBeenCalledWith("publish_revision", {
      p_actor: ACTOR,
      p_item_id: ITEM,
      p_revision_id: REV,
      p_policy_version: "p",
      p_lint_result: { passed: true },
    });
    expect(decision).toEqual({ id: "g-1", revision_id: REV, verdict: "pass", policy_version: "p", decided_at: "t", reasons: {} });
  });

  it("unpublishes, adds and removes allowances with the actor first", async () => {
    const { db, rpc } = fakeDb({ data: true, error: null });
    const gate = createGateRpc(db);
    await expect(gate.addAllowance(ACTOR, ITEM, HASH, "Educational.")).resolves.toBe(true);
    await expect(gate.removeAllowance(ACTOR, ITEM, HASH)).resolves.toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "add_lint_allowance", { p_actor: ACTOR, p_item_id: ITEM, p_sentence_hash: HASH, p_reason: "Educational." });
    expect(rpc).toHaveBeenNthCalledWith(2, "remove_lint_allowance", { p_actor: ACTOR, p_item_id: ITEM, p_sentence_hash: HASH });
    const unpublish = fakeDb({ data: "slug-0b6f3c", error: null });
    await expect(createGateRpc(unpublish.db).callUnpublish(ACTOR, ITEM)).resolves.toBe("slug-0b6f3c");
    expect(unpublish.rpc).toHaveBeenCalledWith("unpublish_item", { p_actor: ACTOR, p_item_id: ITEM });
  });

  it("treats anything but a JSON true from add_lint_allowance as refused", async () => {
    await expect(createGateRpc(fakeDb({ data: false, error: null }).db).addAllowance(ACTOR, ITEM, HASH, "x")).resolves.toBe(false);
    await expect(createGateRpc(fakeDb({ data: null, error: null }).db).addAllowance(ACTOR, ITEM, HASH, "x")).resolves.toBe(false);
  });

  it("maps database errors to typed desk errors, never raw text", async () => {
    const denied = createGateRpc(fakeDb({ data: null, error: { code: "42501", message: "publish_revision: admin only" } }).db);
    await expect(denied.callPublishRevision({ actorId: ACTOR, itemId: ITEM, revisionId: REV, policyVersion: "p", lintResult: {} })).rejects.toBeInstanceOf(AccessDeniedError);
    const missing = createGateRpc(fakeDb({ data: null, error: { code: "P0002", message: "unpublish_item: item x not found" } }).db);
    await expect(missing.callUnpublish(ACTOR, ITEM)).rejects.toBeInstanceOf(ItemNotFoundError);
    const broken = createGateRpc(fakeDb({ data: null, error: { code: "XX000", message: "boom" } }).db);
    await expect(broken.addAllowance(ACTOR, ITEM, HASH, "x")).rejects.toBeInstanceOf(DbError);
  });
});
