import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createLettersRpc } from "./letters/rpc";
import type { LettersRpc } from "./letters/types";

/**
 * The letters' write path for the desk (spec s8.2, ADR-003 shape). The doors of migrations 0024 and 0025 are executable by service_role
 * only, so an admin access token on its own (for example one lifted by XSS) can neither approve a send nor issue a confirmation link.
 * This is the one file of the distribution module that holds the secret-key client (ESLint and distribution.graph.test.ts enforce it);
 * only actions.ts imports it, and only after requireAdmin() has verified the caller, whose id it passes as the actor for the database to
 * check against the admin's profile. The ops steps build the same port from job code.
 */
export const createSendRpc = (): LettersRpc => createLettersRpc(createSupabaseServiceClient());
