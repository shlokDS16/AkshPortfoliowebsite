import { resetToFreshHeartbeats } from "./heartbeats";
import { readLocalStack } from "./stack";

/**
 * With the local stack up, start every run with healthy clocks so the desk's red strip does not
 * appear in unrelated desk specs. desk-clocks.spec.ts sets its own states and restores this one.
 */
export default async function globalSetup(): Promise<void> {
  const stack = readLocalStack();
  if (stack) await resetToFreshHeartbeats(stack);
}
