import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { generateReadmeEvaluationMarkdown } from "../scripts/readme-numbers";

describe("README Evaluation Tables Verification", () => {
  it("verifies README.md evaluation tables match scripts/readme-numbers.ts output exactly", () => {
    const readmePath = resolve(process.cwd(), "README.md");
    const readme = readFileSync(readmePath, "utf-8");
    const startMarker = "<!-- EVAL-TABLES-START -->";
    const endMarker = "<!-- EVAL-TABLES-END -->";

    const startIndex = readme.indexOf(startMarker);
    const endIndex = readme.indexOf(endMarker);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(-1);

    const actualTableContent = readme
      .slice(startIndex + startMarker.length, endIndex)
      .trim();

    const expectedTableContent = generateReadmeEvaluationMarkdown().trim();

    expect(actualTableContent).toBe(expectedTableContent);
  });
});
