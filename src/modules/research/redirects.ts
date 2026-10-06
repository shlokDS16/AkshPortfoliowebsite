import { redirect } from "next/navigation";
import { errorCode, logShape, type ItemNoticeCode } from "./messages";

/**
 * Sends the admin back to a desk screen with a fixed error code (never free text: see messages.ts).
 * Failures the user was not told about are logged by shape (name, op, code), never by message text.
 */
export function failTo(path: string, error: unknown, label = "research"): never {
  const shape = logShape(error);
  if (shape) console.error(`${label} action failed`, shape);
  return redirect(`${path}?error=${errorCode(error)}`);
}

/** Sends the admin back with a fixed one-time confirmation code. */
export function doneTo(path: string, notice: ItemNoticeCode, hash = ""): never {
  return redirect(`${path}?notice=${notice}${hash}`);
}
