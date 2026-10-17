import "server-only";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { featureOn } from "@/lib/features";
import { createLetterPorts, lettersMode, type LetterPorts } from "@/lib/providers";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  createLettersRpc, createPublicLetterSource, reconcileContacts, runLetterSends, sendConfirmations,
  type ConfirmationBatch, type LetterSource, type LettersRpc, type SendRun,
} from "@/modules/distribution";
import type { HeartbeatRepo } from "./heartbeat";
import { createJobHeartbeatRepo } from "./job-deps";
import { runSteps, type Step, type StepResult } from "./steps";

// Job code: the one place (with distribution/send-rpc.ts) the letters get the secret-key client and the Resend ports (ADR-001 s3). The
// logic is in @/modules/distribution (letters/), tested with a fake database and the fixture transport. Three steps:
//   letters:send      (the pump)   claims one approved send at a time and carries it out. Off: claims nothing.
//   letters:reconcile (the daily)  makes Resend's list equal to the confirmed readers. Off: does nothing.
//   letters:purge     (the daily)  clears requests older than 14 days and links past their 7. A retention duty: runs even when letters are off.
// None is in HEALTH_RULES: an optional feature must not raise the alert email. Heartbeat details are counts and fixed words, never an address.

export const LETTERS_OFF = "letters off";
/** Reconcile gets longer than a send does: it has the whole step (250 s) and nothing else to do. */
const DAILY_RECONCILE_MS = 120_000;

export type LetterRuntime = { rpc: LettersRpc; ports: LetterPorts | null; source: LetterSource; siteUrl: string };

/**
 * Built when a step runs (never at import), so a malformed setting lands in that step's own heartbeat. The ports are null while letters
 * are off, and are the only thing that can send; they ask `rpc` (letters_send_live, letters_confirmation_live) before every email.
 */
export function buildLetterRuntime(): LetterRuntime {
  const rpc = createLettersRpc(createSupabaseServiceClient());
  return {
    rpc,
    // Phase 5d (spec s8): the letters are off, so there are no ports whatever the settings say: nothing is sent, listed or confirmed. The retention purge still runs.
    ports: featureOn("letters") ? createLetterPorts(serverEnv(), { approvals: rpc }) : null,
    source: createPublicLetterSource(createSupabasePublicClient()),
    siteUrl: publicEnv().NEXT_PUBLIC_SITE_URL,
  };
}

/** Whether letters are set up (all three settings on production, or the local fixture): the desk says "not set up yet" when they are not. A setting that cannot be read counts as off. */
export function lettersOn(): boolean {
  if (!featureOn("letters")) return false;
  try {
    return lettersMode(serverEnv()).mode !== "off";
  } catch {
    return false;
  }
}

export function sendText(run: SendRun): string {
  if (run.off) return LETTERS_OFF;
  const parts = ([["sent", run.sent], ["failed", run.failed], ["waiting", run.deferred]] as const).filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
  return parts.length > 0 ? parts.join(", ") : "nothing to send";
}

async function send(make: () => LetterRuntime): Promise<string> {
  return sendText(await runLetterSends(make()));
}

async function reconcile(make: () => LetterRuntime): Promise<string> {
  const { rpc, ports } = make();
  if (!ports) return LETTERS_OFF;
  const result = await reconcileContacts({ rpc, contacts: ports.contacts, budgetMs: DAILY_RECONCILE_MS });
  if (!result.ok) throw new Error(result.failure.message);
  return `erased ${result.left}, removed ${result.deleted}, added ${result.added}, readers ${result.readers}${result.complete ? "" : ", not finished"}`;
}

async function purge(make: () => LetterRuntime): Promise<string> {
  const purged = await make().rpc.purge();
  return purged > 0 ? `purged ${purged}` : "nothing to purge";
}

export function letterSteps(make: () => LetterRuntime = buildLetterRuntime): Step[] {
  return [
    { job: "letters:send", run: () => send(make) },
    { job: "letters:reconcile", run: () => reconcile(make) },
    { job: "letters:purge", run: () => purge(make) },
  ];
}
const [SEND, RECONCILE, PURGE] = letterSteps() as [Step, Step, Step];
export const LETTER_SEND_STEP: Step = SEND;
export const LETTER_RECONCILE_STEP: Step = RECONCILE;
export const LETTER_PURGE_STEP: Step = PURGE;

let running: Promise<StepResult[]> | null = null;

/**
 * The desk's press ("Send to ..." and "Send me a test copy") runs the send step at once, on the same code as the pump, under its own
 * `letters:send` heartbeat. One at a time in this process: a second press during one gets `null`. Another server instance would not see
 * this guard, and need not: the database hands each approved send to one worker (claim_letter_send), so a repeat sends nothing twice.
 */
export async function runLetterSendNow(repo: HeartbeatRepo = createJobHeartbeatRepo(), make: () => LetterRuntime = buildLetterRuntime): Promise<StepResult[] | null> {
  if (running) return null;
  running = runSteps([{ job: "letters:send", run: () => send(make) }], (beat) => repo.record(beat));
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** "Send confirmation emails": the readers he chose, through the same ports. With letters off it throws the fixed "not set up" refusal and asks the database for nothing. */
export async function sendConfirmationsNow(actor: string, ids: readonly string[], make: () => LetterRuntime = buildLetterRuntime): Promise<ConfirmationBatch> {
  const { rpc, ports, siteUrl } = make();
  return sendConfirmations({ rpc, ports, siteUrl }, actor, ids);
}
