import { formatDate } from "@/lib/format";
import { lintText } from "./lint";
import { buildLintInput } from "./lint-input";
import type { PublishContext } from "./repo";
import type { LintFinding, LintResult } from "./rules";

export type ChecklistState = "pass" | "fail" | "manual";
export type ChecklistItem = { id: string; state: ChecklistState; name: string; detail: string };
export type GatePreview = { lint: LintResult; items: ChecklistItem[]; failing: number; rule4Needed: boolean };
export type AllowanceRecord = { sentenceHash: string; reason: string; createdAt: string };
export type BodyFlag = { hash: string; rule: string; match: string | null; message: string; allowable: boolean; sentence: string };
export type BodySegment = { text: string; flag: BodyFlag | null; allowed: { hash: string; reason: string; at: string } | null };
export type AnnotatedBody = { paragraphs: BodySegment[][]; unplaced: LintFinding[] };

type PreviewInput = { ctx: PublishContext; today: string; companyPublic: boolean | null; structureProblems: string[] };

/**
 * D17 (revised, R8): the gate's own pure lint on the saved revision, shown before a run. Advisory only: the
 * database gate still decides and records, and the run button never waits for this.
 */
export function previewGate({ ctx, today, companyPublic, structureProblems }: PreviewInput): GatePreview {
  const { item } = ctx;
  const lint = lintText(buildLintInput(ctx, today));
  const isFile = item.kind === "thesis" || item.kind === "case_study";
  // Whole-item findings first (rule 3a's message is one), then sentence-level ones.
  const messages = (rule: string) => [...lint.findings.filter((f) => f.rule === rule)].sort((a, b) => Number(a.sentence !== null) - Number(b.sentence !== null)).map((f) => f.message);
  const row = (id: string, name: string, rule: string, okDetail: string, extra: string[] = []): ChecklistItem => {
    const problems = [...messages(rule), ...extra];
    return { id, name, state: problems.length ? "fail" : "pass", detail: problems[0] ?? okDetail };
  };
  const items: ChecklistItem[] = [
    row("rule-1", "No actionable language", "1", lint.allowedBy.some((a) => a.rule === "1") ? "Passes, with sentences you allowed" : "No buy, sell or target words"),
    row("rule-2", "No performance claims", "2", "No returns or hit rates"),
    row(
      "rule-3",
      "30-day data lag",
      "3",
      item.dataAsOf ? `Figures to ${formatDate(item.dataAsOf)}` : "No dated figures",
      isFile && !item.dataAsOf ? ['Set "Data as of" in Details: it is the "Figures to" date.'] : [],
    ),
    row("rule-5", "Position disclosed", "5", item.companyId ? "Holds position is set" : "No company named"),
    row("rule-6", "What this teaches", "6", "Learning objective is set"),
    row("structure", "File structure", "structure", isFile ? "View, tests and facts line up" : "Not a company file", structureProblems),
  ];
  if (item.companyId) {
    items.push({ id: "company", name: "Company is public", state: companyPublic ? "pass" : "fail", detail: companyPublic ? "The company can be listed" : "Make the company public before publishing." });
  }
  const rule4Needed = item.companyId !== null;
  items.push({ id: "rule-4", name: "No recent change of stance", state: rule4Needed ? "manual" : "pass", detail: rule4Needed ? "Tick the hand check below." : "No company named" });
  return { lint, items, failing: items.filter((i) => i.state === "fail").length, rule4Needed };
}

type Mark = { key: string; sentence: string; flag: BodyFlag | null; allowed: BodySegment["allowed"] };
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * B's gate notes: each flagged or allowed sentence is located inside its paragraph. A sentence carries one note
 * (its first rule); every other finding, and every finding outside the body, is listed apart so none is lost.
 * `allowable` is the recorded rule-1 set (allowableHashes): a rule 1 flag outside it, or any other rule, offers no allowance.
 */
export function annotateBody(bodyMd: string, lint: LintResult, allowances: AllowanceRecord[], allowable: ReadonlySet<string>): AnnotatedBody {
  const reasons = new Map(allowances.map((a) => [a.sentenceHash, a]));
  const marks = new Map<string, Mark>();
  for (const f of lint.findings) {
    if (f.field !== "body" || !f.sentence || !f.sentenceHash) continue;
    const key = `f:${f.rule}:${f.sentenceHash}`;
    if (marks.has(key)) continue;
    const sentence = squash(f.sentence);
    marks.set(key, { key, sentence, flag: { hash: f.sentenceHash, rule: f.rule, match: f.match, message: f.message, allowable: f.rule === "1" && allowable.has(f.sentenceHash), sentence }, allowed: null });
  }
  for (const a of lint.allowedBy) {
    if (a.field !== "body") continue;
    const key = `a:${a.sentenceHash}`;
    const record = reasons.get(a.sentenceHash);
    if (!marks.has(key)) marks.set(key, { key, sentence: squash(a.sentence), flag: null, allowed: { hash: a.sentenceHash, reason: record?.reason ?? "", at: record?.createdAt ?? "" } });
  }
  const placed = new Set<string>();
  const paragraphs = bodyMd
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(squash)
    .filter(Boolean)
    .map((text) => {
      const hits = [...marks.values()]
        .map((m) => ({ m, at: text.indexOf(m.sentence) }))
        .filter((h) => h.at >= 0)
        .sort((a, b) => a.at - b.at);
      const out: BodySegment[] = [];
      let at = 0;
      for (const { m, at: start } of hits) {
        if (start < at) continue;
        if (start > at) out.push({ text: text.slice(at, start), flag: null, allowed: null });
        out.push({ text: m.sentence, flag: m.flag, allowed: m.allowed });
        placed.add(m.key);
        at = start + m.sentence.length;
      }
      if (at < text.length) out.push({ text: text.slice(at), flag: null, allowed: null });
      return out;
    });
  const shown = (f: LintFinding) => f.field === "body" && f.sentenceHash !== null && placed.has(`f:${f.rule}:${f.sentenceHash}`);
  return { paragraphs, unplaced: lint.findings.filter((f) => !shown(f)) };
}
