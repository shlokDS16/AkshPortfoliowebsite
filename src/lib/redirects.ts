import { redirect } from "next/navigation";
import { errorShape } from "./errors";
import { errorCode, userWasTold, type ItemNoticeCode } from "./messages";

/**
 * Sends the admin back to a desk screen with a fixed error code (never free text: see messages.ts).
 * Failures the user was not told about are logged by shape (name, op, code), never by message text.
 */
export function failTo(path: string, error: unknown, label: string): never {
  if (!userWasTold(error)) console.error(`${label} action failed`, errorShape(error));
  return redirect(`${path}?error=${errorCode(error)}`);
}

/** Sends the admin back with a fixed one-time confirmation code. */
export function doneTo(path: string, notice: ItemNoticeCode, hash = ""): never {
  return redirect(`${path}?notice=${notice}${hash}`);
}
