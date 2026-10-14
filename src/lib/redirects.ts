import { redirect } from "next/navigation";
import { errorShape } from "./errors";
import { errorCode, userWasTold, type ErrorCode, type ItemNoticeCode } from "./messages";

/**
 * Sends the admin back to a desk screen with a fixed error code (never free text: see messages.ts).
 * Failures the user was not told about are logged by shape (name, op, code), never by message text.
 */
export function failTo(path: string, error: unknown, label: string): never {
  if (!userWasTold(error)) console.error(`${label} action failed`, errorShape(error));
  return redirect(`${path}?error=${errorCode(error)}`);
}

/** Sends the admin back with a fixed one-time confirmation code, and optionally a second code shown as a second line (`also`). */
export function doneTo(path: string, notice: ItemNoticeCode, hash = "", also?: ItemNoticeCode): never {
  return redirect(`${path}?notice=${notice}${also ? `&also=${also}` : ""}${hash}`);
}

/**
 * The same as failTo for a form that must keep its place and what was typed (a long text the owner would otherwise lose):
 * the action returns the fixed error code as state and the form shows its text beside the fields. Logged by shape, as failTo does.
 */
export function failState(error: unknown, label: string): { error: ErrorCode } {
  if (!userWasTold(error)) console.error(`${label} action failed`, errorShape(error));
  return { error: errorCode(error) };
}
