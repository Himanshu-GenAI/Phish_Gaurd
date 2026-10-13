import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { analyzeText } from "@/lib/analyze/pipeline";

describe("Shared Analysis Pipeline (lib/analyze/pipeline)", () => {
  const SAMPLES_DIR = resolve(process.cwd(), "samples");

  describe("Baseline Rules-Only Mode on 4 Standard Samples", () => {
    it("evaluates digital_arrest.txt to exact Trust 20 (Risk 80)", () => {
      const text = readFileSync(resolve(SAMPLES_DIR, "digital_arrest.txt"), "utf-8");
      const res = analyzeText(text);

      expect(res.trust).toBe(20);
      expect(res.risk).toBe(80);
      expect(res.raw_risk).toBe(80);
      expect(res.band).toBe("scam");
      expect(res.breakdown.rules).toBe(80);
      expect(res.breakdown.rdap).toBe(0);
      expect(res.breakdown.ai).toBe(0);
      expect(res.breakdown.degraded).toEqual([]);
      expect(res.breakdown.skipped).toEqual(["domain-check", "ai-analysis"]);
    });

    it("evaluates fake_internship.txt to exact Trust 13 (Risk 87)", () => {
      const text = readFileSync(resolve(SAMPLES_DIR, "fake_internship.txt"), "utf-8");
      const res = analyzeText(text);

      expect(res.trust).toBe(13);
      expect(res.risk).toBe(87);
      expect(res.raw_risk).toBe(87);
      expect(res.band).toBe("scam");
      expect(res.breakdown.rules).toBe(87);
      expect(res.breakdown.rdap).toBe(0);
      expect(res.breakdown.ai).toBe(0);
      expect(res.breakdown.degraded).toEqual([]);
      expect(res.breakdown.skipped).toEqual(["domain-check", "ai-analysis"]);
    });

    it("evaluates investment_group.txt to exact Trust 25 (Risk 75)", () => {
      const text = readFileSync(resolve(SAMPLES_DIR, "investment_group.txt"), "utf-8");
      const res = analyzeText(text);

      expect(res.trust).toBe(25);
      expect(res.risk).toBe(75);
      expect(res.raw_risk).toBe(75);
      expect(res.band).toBe("high_risk");
      expect(res.breakdown.rules).toBe(75);
      expect(res.breakdown.rdap).toBe(0);
      expect(res.breakdown.ai).toBe(0);
      expect(res.breakdown.degraded).toEqual([]);
      expect(res.breakdown.skipped).toEqual(["domain-check", "ai-analysis"]);
    });

    it("evaluates genuine_offer.txt to exact Trust 97 (Risk 3, raw_risk -19)", () => {
      const text = readFileSync(resolve(SAMPLES_DIR, "genuine_offer.txt"), "utf-8");
      const res = analyzeText(text);

      expect(res.trust).toBe(97);
      expect(res.risk).toBe(3);
      expect(res.raw_risk).toBe(-19);
      expect(res.band).toBe("safe");
      expect(res.breakdown.rules).toBe(-19);
      expect(res.breakdown.rdap).toBe(0);
      expect(res.breakdown.ai).toBe(0);
      expect(res.breakdown.degraded).toEqual([]);
      expect(res.breakdown.skipped).toEqual(["domain-check", "ai-analysis"]);
    });
  });

  describe("Pipeline Invariants & Performance", () => {
    it("executes each analysis in under 50ms", () => {
      const text = readFileSync(resolve(SAMPLES_DIR, "digital_arrest.txt"), "utf-8");
      const start = performance.now();
      analyzeText(text);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it("is strictly deterministic across repeated calls", () => {
      const text = readFileSync(resolve(SAMPLES_DIR, "fake_internship.txt"), "utf-8");
      const first = analyzeText(text);
      for (let i = 0; i < 20; i++) {
        expect(analyzeText(text)).toEqual(first);
      }
    });
  });

  describe("Dataset Validation (Reads dev.json ONLY — Never touches test.json)", () => {
    it("validates dev.json structure and Phase 2b targets", () => {
      const devPath = resolve(process.cwd(), "eval/dataset/dev.json");
      expect(existsSync(devPath)).toBe(true);

      interface DevItem {
        id: string;
        label: string;
        language: string;
        difficulty: string;
        text: string;
        keyword_free?: boolean;
      }

      const dev: DevItem[] = JSON.parse(readFileSync(devPath, "utf-8"));
      expect(Array.isArray(dev)).toBe(true);
      expect(dev).toHaveLength(70);

      const scams = dev.filter((i) => i.label === "scam");
      const genuine = dev.filter((i) => i.label === "genuine");
      expect(scams).toHaveLength(35);
      expect(genuine).toHaveLength(35);

      // Language rebalance: 28 en (40%), 23 hinglish (33%), 19 mixed (27%)
      const enCount = dev.filter((i) => i.language === "en").length;
      const hinglishCount = dev.filter((i) => i.language === "hinglish").length;
      const mixedCount = dev.filter((i) => i.language === "mixed").length;
      expect(enCount).toBe(28);
      expect(hinglishCount).toBe(23);
      expect(mixedCount).toBe(19);

      // Keyword-free scams: >= 45% (>= 16 items in dev)
      const keywordFree = scams.filter((i) => i.keyword_free === true);
      expect(keywordFree.length).toBeGreaterThanOrEqual(16);

      // Hard negatives in dev: >= 20 items
      const hardNegatives = genuine.filter((i) => i.difficulty === "hard");
      expect(hardNegatives.length).toBeGreaterThanOrEqual(20);

      // Near-limit items: 3 items strictly between 4500 and 4900 chars
      const nearLimit = dev.filter((i) => i.text.length >= 4500 && i.text.length <= 4900);
      expect(nearLimit).toHaveLength(3);
    });
  });
});
