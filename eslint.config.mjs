import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NO_APP = { group: ["@/app/*", "@/app/**"], message: "Nothing imports app/* (spec s4)." };
// ops has two extra, deliberately narrow entries: the service-free public health entry and the
// server-only job entry (controller ruling R6). ops.graph.test.ts proves what each can reach.
const OPS_ENTRY_POINTS = ["!@/modules/ops/health", "!@/modules/ops/jobs"];
const MODULE_ENTRY_POINTS = {
  group: ["@/modules/*/*", "@/modules/*/*/**", "!@/modules/*/index", "!@/modules/*/actions", "!@/modules/*/client", ...OPS_ENTRY_POINTS],
  message: "Import a module through its index, actions or client entry point only (spec s4).",
};
const NO_SECRET_CLIENT = {
  group: ["@/lib/supabase/service"],
  message: "The secret-key client is job code (src/modules/ops) plus the one gate RPC file (ADR-001 s3, ADR-003).",
};
// ADR-003: the publish gate's functions are service_role only; this one server-only file calls them after
// requireAdmin(). gate.graph.test.ts proves only compliance/actions.ts imports it.
const GATE_RPC_FILE = "src/modules/compliance/gate-rpc.ts";
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["src/app/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT) },
  { files: ["src/components/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT) },
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    ignores: ["src/modules/ops/**", GATE_RPC_FILE],
    rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT),
  },
  { files: [GATE_RPC_FILE], rules: restrict(NO_APP, MODULE_ENTRY_POINTS) },
  { files: ["src/modules/ops/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS) },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: restrict({
      group: ["@/app/*", "@/app/**", "@/modules/*", "@/modules/**"],
      message: "lib/ is a leaf: it must not import modules or app (spec s4).",
    }),
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env.ts", "src/lib/env.server.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Read env only through src/lib/env.ts or env.server.ts (CLAUDE.md)." },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/supabase/database.types.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
