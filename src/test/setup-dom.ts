import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Component tests opt into jsdom with a `// @vitest-environment jsdom` first line; node tests skip this.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
