# ADR-003: Confine the publish gate to service_role

Status: ACCEPTED by the controller on 2026-10-07 (final review of Plan 1A, finding I1 / ledger Q8)
Amends: ADR-001 s3 ("service-role key only in job/cron code") with one named exception.
Inputs: `.superpowers/sdd/2026-10-04-phase-1a-core/final-review.md` (I1); controller ruling I1 in that folder's `progress.md`; `docs/compliance/publishing-rules.md`.
Implemented in: `supabase/migrations/20261007000004_hardening.sql`, `src/modules/compliance/gate-rpc.ts`.

## 1. Problem
`publish_revision()` accepted a caller-supplied lint result (`passed`, `revisionId`, `policyVersion`) and was executable by `authenticated`. Rules 1, 2, the sentence-level part of rule 3, thesis structure and the rule 8 surfaces are checked only in TypeScript, so anyone holding the admin's access token could call the function directly with `{"passed": true}` and publish actionable or performance text, and `gate_decisions.reasons.lint` would then record a forged pass, so the audit trail would be false. `@supabase/ssr` session cookies are readable by page JavaScript and scoped to the whole origin, so the first XSS on any page (Plan 1B renders Markdown publicly on the same origin) would hand over that token. The same applied to `lint_allowances`: the admin session could INSERT an allowance for any sentence directly.

## 2. Current state (before this ADR)
- `publish_revision(item, revision, policy, lint)` and `unpublish_item(item)`: SECURITY DEFINER, `private.is_admin()` (from `auth.uid()`), EXECUTE to `authenticated` only.
- The policy version was any non-empty string that matched the lint result's own field.
- `lint_allowances`: `authenticated` held SELECT, INSERT, DELETE; the "only a flagged rule 1 sentence" check lived in TypeScript (`allowFlaggedSentence`).
- The secret-key client lived only in `src/modules/ops` (ESLint import ban).

## 3. Options considered
1. **HMAC attestation** (the reviewer's recommendation). TypeScript signs `item:revision:policy:updated_at:exp` with a key in `private.settings`; the SQL recomputes the HMAC and rejects a missing, expired or wrong signature. Keeps EXECUTE on `authenticated` and the in-database `is_admin()` layer. Costs: a second secret to provision, seed, rotate and keep out of logs on both sides (hosted settings row and `GATE_HMAC_KEY` env); a signature format both sides must agree on byte for byte; expiry clock skew between Vercel and Postgres; and the attestation still proves only "some server code signed this", the same trust root as option 2 with more parts.
2. **Confine to service_role** (chosen). REVOKE EXECUTE from `authenticated`; GRANT only to `service_role`; the functions take `p_actor uuid` and re-check it against `profiles.role = 'admin'`; the server action calls them through the secret-key client after `requireAdmin()`.
3. **Move all lint rules into SQL.** The only option that would not trust server code at all. Rejected for now: the lint is a roughly 400-line TypeScript pipeline (normalisation, confusables, abbreviation-aware sentence splitting, lexicons) and a PL/pgSQL port would be two implementations to keep identical. Revisit if the server itself must stop being trusted (see s6).

## 4. Recommendation (the shape)
Option 2.
- `public.publish_revision(p_actor, p_item_id, p_revision_id, p_policy_version, p_lint_result)`, `public.unpublish_item(p_actor, p_item_id)`, `public.add_lint_allowance(p_actor, p_item_id, p_sentence_hash, p_reason)`, `public.remove_lint_allowance(p_actor, p_item_id, p_sentence_hash)`: SECURITY DEFINER, `search_path = ''`, EXECUTE to `service_role` only. Each raises 42501 unless `private.is_admin_user(p_actor)` (profiles.role = 'admin'); that helper is executable by no API role.
- The policy version is pinned in SQL (`c_policy = 'sebi-unreg-2026-07'`); any other value is a recorded `policy` failure. `src/modules/compliance/policy.test.ts` fails if `POLICY_VERSION` and the newest migration's `c_policy` differ.
- `lint_allowances`: `authenticated` keeps SELECT (RLS, admin only) and loses INSERT, UPDATE, DELETE. `add_lint_allowance` re-verifies in SQL that the hash is a rule 1 finding of the item's latest gate decision, and that the decision is for the item's newest revision; otherwise it records nothing and returns false.
- TypeScript: `src/modules/compliance/gate-rpc.ts` (`import "server-only"`) is the only file outside `src/modules/ops` allowed to import `@/lib/supabase/service` (ESLint allowance by exact path). Only `src/modules/compliance/actions.ts` imports it (`gate.graph.test.ts`), and every action there calls `requireAdmin()` first, computes the lint server-side from rows it loads through the admin's cookie session, then calls the RPC with `p_actor = admin.userId`.
- Test-only exception: `e2e/support/items.ts` calls `publish_revision` with the LOCAL stack's secret key (read from `supabase status`; non-local URLs are refused).

## 5. Tradeoffs
- The secret key is now on a user-triggered path, not only a cron path. It is reachable only after `requireAdmin()` (verified claims plus a profiles row), from one file, and it is used for four function calls, never for table access.
- The in-database admin check no longer comes from the JWT (`auth.uid()`) but from an id the server passes. A server bug that passed the wrong id could act as the admin; a non-admin id is still refused in SQL.
- The lint is still computed in TypeScript and handed to SQL. That is now safe because only server code can hand it over; it is not safe against a compromised server (s6).
- Fewer moving parts than HMAC: no second secret, no signature format, no clock skew, no key rotation procedure.

## 6. Risks
- **Residual risk: server compromise.** Anyone who can run code in the Next.js server (a malicious dependency, a leaked `SUPABASE_SECRET_KEY`, a Vercel account takeover) can publish anything with a forged lint. HMAC would not change this: the signing key would sit beside the secret key. Mitigations: the key is read only via `src/lib/env.server.ts`, never logged, `sb_secret_` format (rotatable without a JWT secret change), and every publish still leaves a `gate_decisions` row with the lint it was given.
- **XSS no longer publishes.** A stolen admin access token can still read and edit private desk data and create revisions (RLS allows the admin that), and a revision of a public item does not go live without the gate. Before the first public page: a CSP and a vetted Markdown sanitiser (final review M4, M8).
- **Confinement drift.** A later change could import the service client elsewhere or re-grant EXECUTE. Guarded by ESLint, `gate.graph.test.ts`, the pgTAP allowlist in `0002_function_privileges.test.sql` and `0004_gate_confinement.test.sql` (an `authenticated` admin session is refused on all four functions and on INSERT/DELETE of `lint_allowances`).

## 7. Future evolution
- If the server stops being a trusted party (clients tier, third-party automation), move the text rules into SQL (option 3) or into a separately deployed signer, and keep this ADR's grants.
- Plan 1B's migration (`20261007000005_casefile.sql`) must start from the 0004 `publish_revision` body (actor parameter, pinned policy, IST date), keep the service_role-only grant, and update `c_policy` together with `POLICY_VERSION` if the rules document changes.
