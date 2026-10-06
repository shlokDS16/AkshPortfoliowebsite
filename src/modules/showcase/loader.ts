import type { PublicSnapshot } from "./types";

export type Loaded<T> = { status: "ok"; data: T } | { status: "unavailable" };

/** D12: runtime failures throw (ISR keeps the last good page); build-time failures render "unavailable". */
export function createSnapshotLoader(deps: { load(): Promise<PublicSnapshot>; isBuildPhase(): boolean }) {
  return async (): Promise<Loaded<PublicSnapshot>> => {
    try {
      return { status: "ok", data: await deps.load() };
    } catch (error) {
      if (deps.isBuildPhase()) return { status: "unavailable" };
      throw error;
    }
  };
}
