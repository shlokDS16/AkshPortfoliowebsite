import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NO_APP = { group: ["@/app/*", "@/app/**"], message: "Nothing imports app/* (spec s4)." };
const MODULE_ENTRY_POINTS = {
  group: ["@/modules/*/*", "@/modules/*/*/**", "!@/modules/*/index", "!@/modules/*/actions", "!@/modules/*/client"],
  message: "Import a module through its index, actions or client entry point only (spec s4).",
};
const NO_SECRET_CLIENT = {
  group: ["@/lib/supabase/service"],
  message: "The secret-key client is job code only: use it inside src/modules/ops (ADR-001 s3).",
};
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["src/app/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT) },
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    ignores: ["src/modules/ops/**"],
    rules: restrict(NO_APP, MODULE_ENTRY_POINTS, NO_SECRET_CLIENT),
  },
  { files: ["src/modules/ops/**/*.{ts,tsx}"], rules: restrict(NO_APP, MODULE_ENTRY_POINTS) },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: restrict({
      group: ["@/app/*", "@/app/**", "@/modules/*", "@/modules/**"],
      message: "lib/ is a leaf: it must not import modules or app (spec s4).",
    }),
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
