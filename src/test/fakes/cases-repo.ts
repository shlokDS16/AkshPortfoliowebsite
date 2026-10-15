import { isRecord } from "@/lib/records";
import { CaseError, type CaseErrorCode } from "@/modules/cases/errors";
import type { CasesRepo } from "@/modules/cases/types";
import type { MemoryResearchRepo } from "./research-repo";
import { caseRecordFixture } from "@/test/fixtures/case-record";

/** An in-memory cases repo for the cases module's tests: the record the "database" builds, a failure to raise, the two switches. */
export type FakeCases = CasesRepo & {
  record: unknown;
  failure: CaseErrorCode | null;
  aliases: Map<string, string>;
  on: { reveal: boolean; chart: boolean };
  built: number;
  research: MemoryResearchRepo;
};

export function createFakeCases(research: MemoryResearchRepo): FakeCases {
  const self: FakeCases = {
    record: JSON.parse(JSON.stringify(caseRecordFixture())),
    failure: null,
    aliases: new Map(),
    on: { reveal: false, chart: false },
    built: 0,
    research,
    async buildRecord(ideaId) {
      self.built += 1;
      if (self.failure) throw new CaseError(self.failure);
      return isRecord(self.record) && self.record.idea === ideaId ? self.record : (() => { throw new CaseError("case-not-closed"); })();
    },
    async switches() {
      return self.on;
    },
    async resolveCompany(id) {
      return self.aliases.get(id) ?? id;
    },
    async findItemForIdea(ideaId) {
      for (const r of research.revisions) {
        const led = isRecord(r.structured) ? r.structured.ledger : null;
        if (isRecord(led) && led.idea === ideaId) return r.itemId;
      }
      return null;
    },
  };
  return self;
}
