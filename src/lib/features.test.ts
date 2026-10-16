import { describe, expect, it, vi } from "vitest";
import { FEATURE_NAMES, featureOn, featureOnWith, hiddenItemKinds } from "./features";

describe("featureOnWith (the rule)", () => {
  it("is off with no override", () => {
    for (const name of FEATURE_NAMES) expect(featureOnWith(name, {})).toBe(false);
  });

  it("is on only for a name the override lists, outside Vercel preview and production", () => {
    expect(featureOnWith("letters", { featuresOn: "ownVideos,letters" })).toBe(true);
    expect(featureOnWith("ownVideos", { featuresOn: "letters" })).toBe(false);
    expect(featureOnWith("ownVideos", { featuresOn: " ownVideos , letters ", vercelEnv: "development" })).toBe(true);
  });

  it("ignores unknown names and a wrong case", () => {
    expect(featureOnWith("letters", { featuresOn: "Letters,ownvideos,all,*,true,1" })).toBe(false);
  });

  it("refuses the override on Vercel preview and production", () => {
    for (const vercelEnv of ["preview", "production"]) {
      for (const name of FEATURE_NAMES) expect(featureOnWith(name, { featuresOn: "ownVideos,letters", vercelEnv })).toBe(false);
    }
  });
});

describe("featureOn (reads the environment)", () => {
  it("is off while FEATURES_ON is unset", () => {
    vi.stubEnv("FEATURES_ON", "");
    expect(featureOn("letters")).toBe(false);
    expect(featureOn("ownVideos")).toBe(false);
    expect(hiddenItemKinds()).toEqual(["video", "letter"]);
  });

  it("follows the override off a deployment", () => {
    vi.stubEnv("FEATURES_ON", "letters");
    vi.stubEnv("VERCEL_ENV", "");
    expect(featureOn("letters")).toBe(true);
    expect(featureOn("ownVideos")).toBe(false);
    expect(hiddenItemKinds()).toEqual(["video"]);
  });

  it("refuses the override on a production deployment", () => {
    vi.stubEnv("FEATURES_ON", "ownVideos,letters");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(featureOn("letters")).toBe(false);
    expect(hiddenItemKinds()).toEqual(["video", "letter"]);
  });
});
