import "server-only";
import { z } from "zod";
import { type EnvSource, parseEnv, publicSchema } from "./env";

// Server-only environment (secrets). `server-only` makes a client import a build error.
const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_", "must be a secret key (sb_secret_...)"),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("must be an email address")),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: EnvSource): ServerEnv {
  return parseEnv(serverSchema, source);
}

let cachedServer: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cachedServer ??= parseServerEnv(process.env);
  return cachedServer;
}
