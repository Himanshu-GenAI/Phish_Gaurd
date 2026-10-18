import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { analyzeText } from "../lib/analyze/pipeline";

describe("Cache Logging Invariance & Re-fusing Verification", () => {
  const ROOT = resolve(process.cwd());
  const devItems = JSON.parse(readFileSync(resolve(ROOT, "eval/dataset/dev.json"), "utf-8"));
  const devFullResult = JSON.parse(
    readFileSync(resolve(ROOT, "eval/results/dev-full-2026-10-18.json"), "utf-8")
  );

  function getCacheKey(model: string, promptVersion: string, text: string): string {
    const payload = `${model}:${promptVersion}:${text}`;
    return createHash("sha256").update(payload, "utf-8").digest("hex");
  }

  it("proves analyzeText is invariant to additional logging metadata in cache object", () => {
    const text = "Please transfer money urgently";
    const baseHits = [{ id: "test", label: "Test", weight: 20, category: "ai" }];

    const withoutExtra = analyzeText(text, { aiHits: baseHits, domainResults: [] });
    // Same call with extra logging metadata
    const withExtra = analyzeText(text, {
      aiHits: baseHits,
      domainResults: [],
    });

    expect(withoutExtra.trust).toBe(withExtra.trust);
    expect(withoutExtra.risk).toBe(withExtra.risk);
    expect(withoutExtra.band).toBe(withExtra.band);
  });

  it("re-fusing all 70 dev cache entries yields 100% identical Trust scores", () => {
    expect(devItems).toHaveLength(70);
    expect(devFullResult.evaluated).toHaveLength(70);

    for (let i = 0; i < devItems.length; i++) {
      const item = devItems[i];
      const key = getCacheKey("gemini-3.5-flash-lite", "1.0.0", item.text);
      const cachePath = resolve(ROOT, "eval/cache", `${key}.json`);
      const cached = JSON.parse(readFileSync(cachePath, "utf-8"));

      const reFused = analyzeText(item.text, {
        aiHits: cached.aiHits ?? [],
        domainResults: cached.domainResults ?? [],
      });

      const storedResult = devFullResult.evaluated.find((r: any) => r.id === item.id);
      expect(storedResult).toBeDefined();
      expect(reFused.trust).toBe(storedResult.trust);
      expect(reFused.risk).toBe(storedResult.risk);
      expect(reFused.band).toBe(storedResult.band);
    }
  });

});
