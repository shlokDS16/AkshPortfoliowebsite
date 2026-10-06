import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Final review I5: these helpers live once, in src/lib. A module that needs one imports it; a second
// definition anywhere else under src/ fails here.
const SRC = resolve(__dirname, "..");
const SHARED = ["asRecord", "isRecord", "isUuid", "logShape", "failureDetail", "errorShape", "errorShapeText", "failTo", "doneTo", "errorCode", "noticeText", "userWasTold", "toDeskError", "toResearchError"];
const DEFINITION = new RegExp(String.raw`(?:function|const|let)\s+(${SHARED.join("|")})\b`, "g");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("shared helpers are defined once, in src/lib", () => {
  it("no file outside src/lib defines one of them", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (rel.startsWith("lib/")) continue;
      for (const match of readFileSync(file, "utf8").matchAll(DEFINITION)) offenders.push(`${rel}: ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no class outside src/lib extends Error with a desk error name", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !relative(SRC, file).startsWith(`lib${sep}`))
      .filter((file) => /class\s+(DeskError|ResearchError|ItemNotFoundError|InvalidInputError|AccessDeniedError|ItemRuleError)\b/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
