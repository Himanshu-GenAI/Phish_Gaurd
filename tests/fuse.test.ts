import { describe, it, expect } from "vitest";
import { fuseScores, clamp, getBand } from "@/lib/scoring/fuse";

describe("Scoring & Fusion Engine (lib/scoring/fuse)", () => {
  describe("clamp()", () => {
    it("clamps values below minimum to min", () => {
      expect(clamp(-50, 3, 100)).toBe(3);
      expect(clamp(0, 3, 100)).toBe(3);
      expect(clamp(2, 3, 100)).toBe(3);
    });

    it("clamps values above maximum to max", () => {
      expect(clamp(101, 3, 100)).toBe(100);
      expect(clamp(250, 3, 100)).toBe(100);
    });

    it("preserves values strictly within [min, max]", () => {
      expect(clamp(3, 3, 100)).toBe(3);
      expect(clamp(50, 3, 100)).toBe(50);
      expect(clamp(100, 3, 100)).toBe(100);
    });
  });

  describe("getBand() Risk Band Boundaries", () => {
    it("assigns 'safe' for trust >= 75 (risk <= 25)", () => {
      expect(getBand(97)).toBe("safe");
      expect(getBand(75)).toBe("safe");
    });

    it("assigns 'suspicious' for trust in [50, 74] (risk 26-50)", () => {
      expect(getBand(74)).toBe("suspicious");
      expect(getBand(50)).toBe("suspicious");
    });

    it("assigns 'high_risk' for trust in [25, 49] (risk 51-75)", () => {
      expect(getBand(49)).toBe("high_risk");
      expect(getBand(25)).toBe("high_risk");
    });

    it("assigns 'scam' for trust < 25 (risk > 75)", () => {
      expect(getBand(24)).toBe("scam");
      expect(getBand(13)).toBe("scam");
      expect(getBand(0)).toBe("scam");
    });
  });

  describe("fuseScores() Calculations & Invariants", () => {
    it("handles negative raw_risk by clamping risk to 3 and setting trust to 97", () => {
      const res = fuseScores({
        rulesRisk: -19,
        domainWeight: 0,
        aiWeight: 0,
      });

      expect(res.raw_risk).toBe(-19);
      expect(res.risk).toBe(3);
      expect(res.trust).toBe(97);
      expect(res.band).toBe("safe");
      expect(res.breakdown.raw_risk).toBe(-19);
      expect(res.breakdown.risk).toBe(3);
    });

    it("handles extreme risk by clamping risk to 100 and setting trust to 0", () => {
      const res = fuseScores({
        rulesRisk: 85,
        domainWeight: 20,
        aiWeight: 25,
      });

      expect(res.raw_risk).toBe(130);
      expect(res.risk).toBe(100);
      expect(res.trust).toBe(0);
      expect(res.band).toBe("scam");
    });

    it("correctly tracks degraded layers when supplied", () => {
      const res = fuseScores({
        rulesRisk: 40,
        degraded: ["ai-analysis", "domain-check"],
      });

      expect(res.breakdown.degraded).toEqual(["ai-analysis", "domain-check"]);
    });

    it("does not include skipped property in breakdown when skipped is not provided", () => {
      const res = fuseScores({
        rulesRisk: 25,
      });

      expect(res.breakdown).not.toHaveProperty("skipped");
    });

    it("includes skipped only when explicitly passed by internal callers", () => {
      const res = fuseScores({
        rulesRisk: 25,
        skipped: ["domain-check", "ai-analysis"],
      });

      expect(res.breakdown.skipped).toEqual(["domain-check", "ai-analysis"]);
    });
  });
});
