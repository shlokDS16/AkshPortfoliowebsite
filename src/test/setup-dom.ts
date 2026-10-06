import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { afterEach, vi } from "vitest";

// Component tests opt into jsdom with a `// @vitest-environment jsdom` first line; node tests skip this.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

// NumberFlow renders a custom element with adopted stylesheets; jsdom lacks them. Tests see a plain span
// that exposes the props CountFlow passes (motion.test.tsx asserts respectMotionPreference is untouched).
vi.mock("@number-flow/react", () => ({
  default: (props: { value: number; respectMotionPreference?: boolean }) =>
    createElement("span", { "data-testid": "flow", "data-respect": String(props.respectMotionPreference) }, props.value),
}));
