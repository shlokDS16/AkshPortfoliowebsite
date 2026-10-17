import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Phase 5d: the letters and own-channel videos are off in production (src/lib/features.ts); the suites that test them run with them on.
    // A test of the off state stubs it empty (features.test.ts and the tests that name "off").
    env: { FEATURES_ON: "ownVideos,letters" },
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup-dom.ts", "./src/test/no-outbound.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
