import type { ApprovalCheck, LetterFailure, LetterPorts, LetterResult, LetterTransport } from "./letters";

// The no-send guard (Phase 5c, spec s9.2): the only holder of a letters transport. Every method that can put an email in someone's
// inbox first asks the database whether a recorded approval is live for exactly that send (letters_send_live /
// letters_confirmation_live, migration 0025), and calls nothing when the answer is no, the check throws, or the approval is not
// even shaped like one. The recipient of a self test (ADMIN_EMAIL), the broadcast's name and every idempotency key are derived
// here from the approval, so a caller cannot widen what was approved. Reads and the contact mirror send nothing and pass through.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A timestamptz as PostgREST returns it (ISO, `T`, an offset); printable, so it can sit in an idempotency key. */
const SENT_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** Pending Shlok's approval: stored on a failed send and shown on the desk. */
export const NOT_APPROVED_MESSAGE = "No approved send matches this.";
const notApproved: LetterFailure = { ok: false, kind: "not_approved", message: NOT_APPROVED_MESSAGE };

/** The broadcast name a send's draft carries; sendBroadcast sends only a draft with this name. */
export const broadcastName = (sendId: string) => `letter-${sendId}`;

export function guardLetterTransport(transport: LetterTransport, deps: { approvals: ApprovalCheck; adminEmail: string }): LetterPorts {
  const { approvals } = deps;
  const adminEmail = deps.adminEmail.trim().toLowerCase();

  /** True only on a definite yes from the database. */
  async function live(ask: () => Promise<boolean>): Promise<boolean> {
    try {
      return (await ask()) === true;
    } catch {
      return false;
    }
  }

  const sender = {
    name: transport.name,

    async sendSelfTest({ sendId }: { sendId: string }, letter: { subject: string; html: string; text: string }): Promise<LetterResult<null>> {
      if (!UUID.test(sendId) || !(await live(() => approvals.sendIsLive(sendId, "self_test", null)))) return notApproved;
      const sent = await transport.sendOne({ to: adminEmail, ...letter, idempotencyKey: `self-test-${sendId}` });
      return sent.ok ? { ok: true, value: null } : sent;
    },

    async sendConfirmation(
      approval: { subscriberId: string; email: string; sentAt: string },
      email: { subject: string; text: string },
    ): Promise<LetterResult<null>> {
      const { subscriberId, sentAt } = approval;
      if (!UUID.test(subscriberId) || !SENT_AT.test(sentAt)) return notApproved;
      if (!(await live(() => approvals.confirmationIsLive(subscriberId, approval.email, sentAt)))) return notApproved;
      const sent = await transport.sendOne({ to: approval.email, ...email, idempotencyKey: `confirm-${subscriberId}-${sentAt}` });
      return sent.ok ? { ok: true, value: null } : sent;
    },

    async createBroadcast({ sendId }: { sendId: string }, letter: { subject: string; html: string; text: string }) {
      if (!UUID.test(sendId) || !(await live(() => approvals.sendIsLive(sendId, "subscribers", null)))) return notApproved;
      return transport.createBroadcast({ name: broadcastName(sendId), ...letter });
    },

    getBroadcast: (id: string) => transport.getBroadcast(id),

    async sendBroadcast({ sendId }: { sendId: string }, broadcastId: string): Promise<LetterResult<"sent_now" | "already_sent">> {
      if (!UUID.test(sendId) || !(await live(() => approvals.sendIsLive(sendId, "subscribers", broadcastId)))) return notApproved;
      // Read before sending: broadcasts take no idempotency key, so this is what stops a retry after a crash sending twice.
      const read = await transport.getBroadcast(broadcastId);
      if (!read.ok) return read;
      const b = read.value;
      if (b.name !== broadcastName(sendId) || b.segmentId !== transport.segmentId) return notApproved;
      if (b.status === "scheduled" || b.status === "queued" || b.status === "sent") return { ok: true, value: "already_sent" };
      if (b.status !== "draft") return notApproved;
      const sent = await transport.sendBroadcast(broadcastId);
      return sent.ok ? { ok: true, value: "sent_now" } : sent;
    },
  };

  const contacts = {
    listContacts: () => transport.listContacts(),
    upsertContact: (email: string) => transport.upsertContact(email),
    deleteContact: (email: string) => transport.deleteContact(email),
  };

  return { name: transport.name, sender, contacts };
}
