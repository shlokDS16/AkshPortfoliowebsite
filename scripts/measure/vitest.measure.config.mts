import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the one-off cap measurements (Plan 2.7 Task 1): `pnpm vitest run -c scripts/measure/vitest.measure.config.mts`. Kept out of the normal
// test run (src/**) because it builds a workbook at the size caps and takes a minute. Same aliases as vitest.config.mts.
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("../../src/test/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["scripts/measure/*.measure.ts"],
    testTimeout: 600_000,
    pool: "forks",
  },
});
