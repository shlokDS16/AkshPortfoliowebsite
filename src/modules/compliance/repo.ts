import { asRecord } from "@/lib/records";
import type { Json } from "@/lib/supabase/database.types";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import type { HoldsPosition, ItemKind, Visibility } from "@/modules/research";
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

/** Reads, through the admin's cookie session (RLS applies). Pages and actions use it. */
export interface ComplianceRepo {
  loadPublishContext(itemId: string, revisionId: string): Promise<PublishContext | null>;
  latestDecision(itemId: string): Promise<DecisionRow | null>;
  /** The id of the item's newest revision (highest rev_no), or null when it has none. */
  latestRevisionId(itemId: string): Promise<string | null>;
}

/**
 * Writes to the gate, reachable only by service_role (ADR-003; implemented in gate-rpc.ts). `actorId` is the
 * admin that requireAdmin() verified in this request; the SQL re-checks it against profiles.role.
 */
export interface GateRpc {
  /** The slug is assigned inside publish_revision() (ruling R5); a collision comes back as a recorded `slug` failure. */
  callPublishRevision(args: { actorId: string; itemId: string; revisionId: string; policyVersion: string; lintResult: Json }): Promise<DecisionRow>;
  callUnpublish(actorId: string, itemId: string): Promise<string | null>;
  /** True when stored (or already present); false when the SQL refused: not a rule 1 flag of the latest decision. */
  addAllowance(actorId: string, itemId: string, sentenceHash: string, reason: string): Promise<boolean>;
  /** True when an allowance was removed. */
  removeAllowance(actorId: string, itemId: string, sentenceHash: string): Promise<boolean>;
}

const DECISION_COLUMNS = "id, revision_id, verdict, policy_version, decided_at, reasons";
const ITEM_COLUMNS =
  "id, kind, title, slug, learning_objective, company_id, holds_position, data_as_of, visibility, company:companies(name, one_liner), theme:themes(name)";

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
          structured: asRecord(revision.data.structured) ?? {},
          changeReason: revision.data.change_reason,
        },
        companyName: item.data.company?.name ?? null,
        companyOneLiner: item.data.company?.one_liner ?? null,
        themeName: item.data.theme?.name ?? null,
        allowances: allowances.data.map((a) => a.sentence_hash),
      };
    },
    async latestDecision(itemId) {
      const { data, error } = await db
        .from("gate_decisions")
        .select(DECISION_COLUMNS)
        .eq("item_id", itemId)
        .order("decided_at", { ascending: false })
        .order("created_at", { ascending: false }) // same order as add_lint_allowance() in SQL
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("compliance.latestDecision", error);
      return data;
    },
    async latestRevisionId(itemId) {
      const { data, error } = await db
        .from("item_revisions")
        .select("id")
        .eq("item_id", itemId)
        .order("rev_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw dbError("compliance.latestRevisionId", error);
      return data?.id ?? null;
    },
  };
}
