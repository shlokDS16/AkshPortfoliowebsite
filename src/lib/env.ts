import { z } from "zod";

// The only file that reads process.env (CLAUDE.md). Labels match .env.example [REQUIRED-P1].
// Unknown variables (dev-only tokens, later-phase keys) are ignored: z.object strips them.
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_", "must be a publishable key (sb_publishable_...)"),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_", "must be a secret key (sb_secret_...)"),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("must be an email address")),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
type Source = Record<string, string | undefined>;

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee .env.example.`);
    this.name = "EnvError";
  }
}

function parse<S extends z.ZodType>(schema: S, source: Source): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Messages carry variable names and rules, never values.
    throw new EnvError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  return result.data;
}

export function parsePublicEnv(source: Source): PublicEnv {
  return parse(publicSchema, source);
}

export function parseServerEnv(source: Source): ServerEnv {
  return parse(serverSchema, source);
}

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

export function publicEnv(): PublicEnv {
  // Literal property access so Next.js inlines NEXT_PUBLIC_* values into browser bundles.
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cachedPublic;
}

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never run in the browser");
  }
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}
