import { describe, it, expect, vi } from "vitest";
import {
  wilsonScoreInterval,
  computeRocAuc,
  getCacheKey,
  runEvaluation,
} from "../eval/run";


describe("Evaluation Harness Core Algorithms (eval/run.ts)", () => {
  describe("wilsonScoreInterval()", () => {
    it("handles zero denominator without NaN or errors", () => {
      const res = wilsonScoreInterval(0, 0);
      expect(res.value).toBe(0);
      expect(res.ciLower).toBe(0);
      expect(res.ciUpper).toBe(0);
    });

    it("computes accurate 95% Wilson confidence intervals for sample proportions", () => {
      // 30 successes out of 35 trials (85.7%)
      const res = wilsonScoreInterval(30, 35);
      expect(res.value).toBe(85.7);
      expect(res.ciLower).toBeGreaterThan(69);
      expect(res.ciUpper).toBeLessThan(95);
      expect(res.ciLower).toBeLessThan(res.value);
      expect(res.ciUpper).toBeGreaterThan(res.value);
    });

    it("bounds interval strictly within [0, 100]", () => {
      const zero = wilsonScoreInterval(0, 50);
      expect(zero.ciLower).toBe(0);

      const perfect = wilsonScoreInterval(50, 50);
      expect(perfect.ciUpper).toBeLessThanOrEqual(100);
    });
  });

  describe("computeRocAuc()", () => {
    it("returns 1.0 for perfect separation (all positives scored higher than negatives)", () => {
      const scores = [
        { score: 90, isPositive: true },
        { score: 80, isPositive: true },
        { score: 30, isPositive: false },
        { score: 10, isPositive: false },
      ];
      expect(computeRocAuc(scores)).toBe(1.0);
    });

    it("returns 0.5 for random / identical scores", () => {
      const scores = [
        { score: 50, isPositive: true },
        { score: 50, isPositive: false },
      ];
      expect(computeRocAuc(scores)).toBe(0.5);
    });

    it("returns 0.0 for completely inverted scores", () => {
      const scores = [
        { score: 10, isPositive: true },
        { score: 90, isPositive: false },
      ];
      expect(computeRocAuc(scores)).toBe(0.0);
    });
  });

  describe("Response Cache Keying & Invalidation", () => {
    it("generates deterministic sha256 hash key", () => {
      const key1 = getCacheKey("gemini-2.5-flash", "1.0.0", "Pay registration fee");
      const key2 = getCacheKey("gemini-2.5-flash", "1.0.0", "Pay registration fee");
      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64);
    });

    it("invalidates cache key when PROMPT_VERSION changes", () => {
      const keyV1 = getCacheKey("gemini-2.5-flash", "1.0.0", "Pay registration fee");
      const keyV2 = getCacheKey("gemini-2.5-flash", "1.1.0", "Pay registration fee");
      expect(keyV1).not.toBe(keyV2);
    });

    it("differentiates different model names", () => {
      const keyModelA = getCacheKey("gemini-2.5-flash", "1.0.0", "Sample message");
      const keyModelB = getCacheKey("gemini-1.5-pro", "1.0.0", "Sample message");
      expect(keyModelA).not.toBe(keyModelB);
    });
  });

  describe("Gating & Mock Cache Halt Logic", () => {
    it("refuses --split test without --final flag", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`process.exit called with ${code}`);
      }) as unknown as (code?: string | number | null | undefined) => never);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        runEvaluation({ split: "test", mode: "rules" })
      ).rejects.toThrow("process.exit called with 1");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("requires the --final flag")
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("refuses --split test when test.sha256 is missing", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`process.exit called with ${code}`);
      }) as unknown as (code?: string | number | null | undefined) => never);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        runEvaluation({ split: "test", mode: "rules", final: true })
      ).rejects.toThrow("process.exit called with 1");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("test.sha256 does not exist")
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it("halts in full mode when cache is missing and --live is not passed", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`process.exit called with ${code}`);
      }) as unknown as (code?: string | number | null | undefined) => never);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(
        runEvaluation({ split: "dev", mode: "full", cacheDir: "nonexistent-cache-dir" })
      ).rejects.toThrow("process.exit called with 1");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[CACHE MISS]")
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});

