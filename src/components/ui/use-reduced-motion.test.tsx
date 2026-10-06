// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "@/test/ui";
import { usePrefersReducedMotion } from "./use-reduced-motion";

afterEach(() => vi.unstubAllGlobals());

describe("usePrefersReducedMotion", () => {
  it("reads the OS setting", () => {
    mockMatchMedia({ reducedMotion: true });
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
    mockMatchMedia();
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });

  it("is false without matchMedia, so components render in tests that never mock it", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(typeof window.matchMedia).not.toBe("function");
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });
});
