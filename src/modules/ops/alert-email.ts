import { istDateTime } from "@/lib/dates";
import type { AlertMailer, AlertMessage, AlertSend } from "@/lib/providers/alert-mailer";
import { dbError } from "@/lib/supabase/errors";
import type { Db } from "@/lib/supabase/types";
import { describeQueue, describeStale, getHealthReport, HEALTH_RULES, readQueueAge, type HealthReport } from "./health";
import type { HeartbeatRepo } from "./heartbeat";

// alerts:email, the last step of both server clocks (docs/specs/2026-10-14-alert-email-design.md). Job code: it reads the
// PRIVATE health report (what the desk strip shows), hands the red set to public.alert_step() (every decision about incidents
// is made there, under a lock), sends the one email that function names, and records the send.
//
// Nothing here puts a secret, a heartbeat detail beyond what describeStale already shows on the desk, a URL with a token or a
// stack trace in an email. The step is NOT a health rule (an alerting failure must not become an incident of its own); a send
// that fails fails this step's heartbeat, and the steps before it have already run and recorded.

export type AlertDeps = {
  /** The secret-key client: alert_step and alert_sent are service_role only. */
  db: Db;
  /** Reads the latest heartbeat per clock, with its detail (the secret-key client bypasses RLS, like the desk's admin session). */
  repo: HeartbeatRepo;
  /** Builds the mailer when the step runs: null while alerts are off, and a bad setting throws (it fails this step only). */
  mailer: () => AlertMailer | null;
  now: () => Date;
  /** The desk's address without a trailing slash (NEXT_PUBLIC_SITE_URL). */
  origin: string;
};

type Due = { incident_id: number; kind: string; keys: string[]; opened_at: string };

export const OPEN_SUBJECT = "Aksh Research Desk: something needs a look";
export const CLOSED_SUBJECT = "Aksh Research Desk: all clear again";

/** The `job` of every failing clock, in the report's order, then "queue" when documents are not moving. */
export function redKeys(report: HealthReport): string[] {
  return [...report.checks.filter((c) => !c.ok).map((c) => c.job), ...(report.queue.ok ? [] : ["queue"])];
}

const sentence = (line: string): string => {
  const capital = line.charAt(0).toUpperCase() + line.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/** What a key was, for a retry that finds the checks green again. A key this code does not know says nothing about itself. */
function recovered(key: string): string {
  const label = HEALTH_RULES.find((r) => r.job === key)?.label;
  const what = key === "queue" ? "documents were not moving" : label ? `${label} needed a look` : "something else needed a look";
  return sentence(`${what} a little while ago, and may have recovered`);
}

/** One line per red item, in the words the desk strip already uses. `keys` speaks only when nothing is red now. */
export function openMessage(report: HealthReport, keys: readonly string[], origin: string): Omit<AlertMessage, "idempotencyKey"> {
  const queue = describeQueue(report);
  const live = [...describeStale(report), ...(queue ? [queue] : [])].map(sentence);
  const lines = live.length > 0 ? live : keys.map(recovered);
  return {
    subject: OPEN_SUBJECT,
    text: [
      "Something on the Aksh Research Desk needs a look:",
      "",
      ...lines.map((line) => `- ${line}`),
      "",
      "Nothing you saved is lost.",
      "",
      `Open the desk to see the details: ${origin}/desk`,
      "If it is still red tomorrow, tell Shlok.",
      "",
    ].join("\n"),
  };
}

export function closedMessage(openedAt: string, origin: string): Omit<AlertMessage, "idempotencyKey"> {
  return {
    subject: CLOSED_SUBJECT,
    text: [`Everything is running again (it was first noticed ${istDateTime(openedAt)}).`, "", `The desk: ${origin}/desk`, ""].join("\n"),
  };
}

/** The port never throws by contract; a bug in an adapter must still be a failed step with a reason. */
const ask = (mailer: AlertMailer, message: AlertMessage): Promise<AlertSend> =>
  Promise.resolve()
    .then(() => mailer.send(message))
    .catch(() => ({ ok: false as const, message: "the alert mailer failed unexpectedly" }));

/** The step: returns the heartbeat detail; throws (a failed heartbeat) when a send or a database call fails. */
export async function alertEmail(deps: AlertDeps): Promise<string> {
  const mailer = deps.mailer();
  if (!mailer) return "email off: RESEND_API_KEY or ALERT_EMAIL is not set";

  const report = await getHealthReport(deps.repo, deps.now(), await readQueueAge(deps.db));
  const keys = redKeys(report);
  const { data, error } = await deps.db.rpc("alert_step", { p_red: keys });
  if (error) throw dbError("ops.alertStep", error);
  const due: Due | undefined = data?.[0];
  if (!due) return "no incident";
  if (due.kind === "still_open") return `incident ${due.incident_id} still open`;
  if (due.kind !== "open" && due.kind !== "closed") throw new Error(`alert_step answered an unknown kind for incident ${due.incident_id}`);

  const body = due.kind === "open" ? openMessage(report, due.keys, deps.origin) : closedMessage(due.opened_at, deps.origin);
  const sent = await ask(mailer, { ...body, idempotencyKey: `incident-${due.incident_id}-${due.kind}` });
  // A failed send is not recorded: the next clock tick is offered the same email again.
  if (!sent.ok) throw new Error(sent.message);
  const recorded = await deps.db.rpc("alert_sent", { p_id: due.incident_id, p_kind: due.kind });
  if (recorded.error) throw dbError("ops.alertSent", recorded.error);
  return `${due.kind === "open" ? "opened" : "closed"} incident ${due.incident_id}, emailed`;
}
