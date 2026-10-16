import "server-only";
import { featureEnv } from "./env";

// Phase 5d (spec s8, D109): the letters (5c) and the own-channel videos (5b) are switched off and out of view. Nothing is deleted: the
// tables, the code and their tests stay. Turning one back on is a one-line change here (set its constant to true) in a normal PR.
//
// The constant is the only switch a deployment has. `FEATURES_ON` (a comma-separated list of names) turns a feature on for tests and
// local runs only, so the hidden code stays tested; it is ignored on Vercel preview and production, so a stray setting there changes nothing.
// Server code only (`server-only`): a client component is handed the answer as a prop. The two settings are read through lib/env.ts (plain strings, no secret),
// because the public pages call this and must not reach env.server.ts (isolation.test.ts).

export const FEATURE_NAMES = ["ownVideos", "letters"] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

const FEATURES: Record<FeatureName, boolean> = { ownVideos: false, letters: false };

/** The item kinds each feature owns (their public pages and desk pages are the only home of these kinds). */
const KIND_OF = { ownVideos: "video", letters: "letter" } as const;

export type FeatureInput = { featuresOn?: string | undefined; vercelEnv?: string | undefined };

/** The rule, with its inputs passed in. A name matches exactly (case and all); a deployment on Vercel preview or production never takes the override. */
export function featureOnWith(name: FeatureName, input: FeatureInput): boolean {
  if (FEATURES[name]) return true;
  if (input.vercelEnv === "preview" || input.vercelEnv === "production") return false;
  return (input.featuresOn ?? "").split(",").some((entry) => entry.trim() === name);
}

export function featureOn(name: FeatureName): boolean {
  return featureOnWith(name, featureEnv());
}

/** The item kinds the public snapshot must not carry while their feature is off. */
export function hiddenItemKinds(): ("video" | "letter")[] {
  return FEATURE_NAMES.filter((name) => !featureOn(name)).map((name) => KIND_OF[name]);
}
