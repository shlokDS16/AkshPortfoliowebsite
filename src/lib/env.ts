import { z } from "zod";

// With env.server.ts, the only code that reads process.env (CLAUDE.md; ESLint enforces it).
// Labels match .env.example [REQUIRED-P1]. Unknown variables (dev-only tokens, later-phase
// keys) are ignored: z.object strips them. Server-only values live in env.server.ts so a
// client import of them is a build error.
const httpUrl = z.url({ protocol: /^https?$/, error: "must be an http(s) URL" });

export const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: httpUrl.transform((url) => url.replace(/\/+$/, "")),
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_", "must be a publishable key (sb_publishable_...)"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type EnvSource = Record<string, string | undefined>;

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee .env.example.`);
    this.name = "EnvError";
  }
}

export function parseEnv<S extends z.ZodType>(schema: S, source: EnvSource): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Messages carry variable names and rules, never values.
    throw new EnvError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  return result.data;
}

export function parsePublicEnv(source: EnvSource): PublicEnv {
  return parseEnv(publicSchema, source);
}

let cachedPublic: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  // Literal property access so Next.js inlines NEXT_PUBLIC_* values into browser bundles.
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cachedPublic;
}
