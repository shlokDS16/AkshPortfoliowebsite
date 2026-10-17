import { isUuid } from "@/lib/ids";
import type { AdminIdentity } from "@/modules/identity";

// The desk's picture of a saved source (Phase 5d, spec s6.5). Admin session first (a fetch cannot follow a redirect to a sign-in page, so no
// session is a 401); the id must be a UUID before anything is read; the answer is the JPEG, private and short-lived, or a 404 with no body.
// The proxy covers /desk, but proxy.ts is not an auth boundary, so this route checks for itself.

export type ThumbDeps = {
  getAdmin: () => Promise<AdminIdentity | null>;
  thumb: (id: string) => Promise<Uint8Array | null>;
};

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export function createThumbHandler(deps: ThumbDeps) {
  return async (_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> => {
    if (!(await deps.getAdmin())) return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
    const { id } = await params;
    if (!isUuid(id)) return NOT_FOUND();
    let bytes: Uint8Array | null;
    try {
      bytes = await deps.thumb(id);
    } catch {
      return NOT_FOUND();
    }
    if (!bytes) return NOT_FOUND();
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-length": String(bytes.length) },
    });
  };
}
