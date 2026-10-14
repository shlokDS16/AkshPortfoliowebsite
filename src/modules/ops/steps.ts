import { safeErrorText } from "@/lib/supabase/errors";

export type Step = { job: string; run: () => Promise<string | void> };
export type StepResult = { job: string; ok: boolean; detail: string; ms: number };
export type RecordHeartbeat = (beat: { job: string; ok: boolean; detail: string }) => Promise<void>;

// A heartbeat's detail is readable on the desk: a database failure is recorded as its operation and code only.
const errorText = safeErrorText;

/** Independent, individually try/caught steps, each writing its own heartbeat (ADR-001 s8.2). */
export async function runSteps(steps: readonly Step[], record: RecordHeartbeat, now: () => number = Date.now): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of steps) {
    const started = now();
    let result: StepResult;
    try {
      const detail = await step.run();
      result = { job: step.job, ok: true, detail: typeof detail === "string" ? detail : "ok", ms: now() - started };
    } catch (error) {
      result = { job: step.job, ok: false, detail: errorText(error).slice(0, 500), ms: now() - started };
    }
    try {
      await record({ job: result.job, ok: result.ok, detail: result.detail });
    } catch (error) {
      result = { ...result, ok: false, detail: `${result.detail}; heartbeat write failed: ${errorText(error)}`.slice(0, 500) };
    }
    results.push(result);
  }
  return results;
}
