import type { Json } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { toResearchError, type HoldsPosition, type ItemKind, type Visibility } from "@/modules/research";
import type { DecisionRow } from "./decision";

/** Everything lintText() needs for one revision of one item, loaded by the server, never supplied by a client. */
export type PublishContext = {
  item: {
    id: string;
    kind: ItemKind;
    title: string;
    slug: string | null;
    learningObjective: string | null;
    companyId: string | null;
    holdsPosition: HoldsPosition | null;
    dataAsOf: string | null;
    visibility: Visibility;
  };
  revision: { id: string; bodyMd: string; structured: Record<string, unknown>; changeReason: string | null };
  companyName: string | null;
  companyOneLiner: string | null;
  themeName: string | null;
  /** sentence_hash values allowed for this item (rule 1 only; see lint.ts). */
  allowances: string[];
};

export interface ComplianceRepo {
  loadPublishContext(itemId: string, revisionId: string): Promise<PublishContext | null>;
  /** The slug is assigned inside publish_revision() (ruling R5); a collision comes back as a recorded `slug` failure. */
  callPublishRevision(args: { itemId: string; revisionId: string; policyVersion: string; lintResult: Json }): Promise<DecisionRow>;
  callUnpublish(itemId: string): Promise<string | null>;
  latestDecision(itemId: string): Promise<DecisionRow | null>;
  addAllowance(itemId: string, sentenceHash: string, reason: string): Promise<void>;
}

const DECISION_COLUMNS = "id, revision_id, verdict, policy_version, decided_at, reasons";
const ITEM_COLUMNS =
  "id, kind, title, slug, learning_objective, company_id, holds_position, data_as_of, visibility, company:companies(name, one_liner), theme:themes(name)";

function asRecord(value: Json): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function createSupabaseComplianceRepo(db: Db): ComplianceRepo {
  return {
    async loadPublishContext(itemId, revisionId) {
      const [item, revision, allowances] = await Promise.all([
        db.from("items").select(ITEM_COLUMNS).eq("id", itemId).maybeSingle(),
        db
          .from("item_revisions")
          .select("id, body_md, structured, change_reason")
          .eq("id", revisionId)
          .eq("item_id", itemId)
          .maybeSingle(),
        db.from("lint_allowances").select("sentence_hash").eq("item_id", itemId),
      ]);
      if (item.error) throw dbError("compliance.loadItem", item.error);
      if (revision.error) throw dbError("compliance.loadRevision", revision.error);
      if (allowances.error) throw dbError("compliance.loadAllowances", allowances.error);
      if (!item.data || !revision.data) return null;
      return {
        item: {
          id: item.data.id,
          kind: item.data.kind as ItemKind,
          title: item.data.title,
          slug: item.data.slug,
          learningObjective: item.data.learning_objective,
          companyId: item.data.company_id,
          holdsPosition: item.data.holds_position as HoldsPosition | null,
          dataAsOf: item.data.data_as_of,
          visibility: item.data.visibility as Visibility,
        },
        revision: {
          id: revision.data.id,
          bodyMd: revision.data.body_md,
          structured: asRecord(revision.data.structured),
          changeReason: revision.data.change_reason,
        },
        companyName: item.data.company?.name ?? null,
        companyOneLiner: item.data.company?.one_liner ?? null,
        themeName: item.data.theme?.name ?? null,
        allowances: allowances.data.map((a) => a.sentence_hash),
      };
    },
    async callPublishRevision({ itemId, revisionId, policyVersion, lintResult }) {
      const { data, error } = await db.rpc("publish_revision", {
        p_item_id: itemId,
        p_revision_id: revisionId,
        p_policy_version: policyVersion,
        p_lint_result: lintResult,
      });
      if (error) throw toResearchError("compliance.publish_revision", error, itemId);
      return { id: data.id, revision_id: data.revision_id, verdict: data.verdict, policy_version: data.policy_version, decided_at: data.decided_at, reasons: data.reasons };
    },
    async callUnpublish(itemId) {
      const { data, error } = await db.rpc("unpublish_item", { p_item_id: itemId });
      if (error) throw toResearchError("compliance.unpublish_item", error, itemId);
      return data;
    },
    async latestDecision(itemId) {
      const { data, error } = await db
        .from("gate_decisions")
        .select(DECISION_COLUMNS)
        .eq("item_id", itemId)
        .order("decided_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("compliance.latestDecision", error);
      return data;
    },
    async addAllowance(itemId, sentenceHash, reason) {
      const { error } = await db
        .from("lint_allowances")
        // DO NOTHING on a repeat: the admin holds INSERT, not UPDATE, on lint_allowances.
        .upsert({ item_id: itemId, sentence_hash: sentenceHash, reason }, { onConflict: "item_id,sentence_hash", ignoreDuplicates: true });
      if (error) throw toResearchError("compliance.addAllowance", error, itemId);
    },
  };
}
