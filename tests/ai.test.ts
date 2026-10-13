import { describe, it, expect, vi } from "vitest";
import {
  isValidGeminiResult,
  geminiSignalsToHits,
  PROMPT_VERSION,
  analyzeWithGemini,
  analyzeAudioWithGemini,
} from "@/lib/ai/gemini";

describe("AI Layer & Robustness (lib/ai/gemini)", () => {
  describe("PROMPT_VERSION Export", () => {
    it("exports a defined semantic PROMPT_VERSION string", () => {
      expect(typeof PROMPT_VERSION).toBe("string");
      expect(PROMPT_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe("isValidGeminiResult() Schema Validation", () => {
    it("returns false for non-object, null, or empty inputs", () => {
      expect(isValidGeminiResult(null)).toBe(false);
      expect(isValidGeminiResult(undefined)).toBe(false);
      expect(isValidGeminiResult("string")).toBe(false);
      expect(isValidGeminiResult(123)).toBe(false);
      expect(isValidGeminiResult({})).toBe(false);
    });

    it("returns false when required top-level fields are missing or wrong types", () => {
      expect(isValidGeminiResult({ scam_type: "fake_job" })).toBe(false);
      expect(
        isValidGeminiResult({
          scam_type: "fake_job",
          ai_signals: "not-an-array",
          verdict: "test",
          next_steps: [],
        })
      ).toBe(false);
      expect(
        isValidGeminiResult({
          scam_type: 123,
          ai_signals: [],
          verdict: "test",
          next_steps: [],
        })
      ).toBe(false);
      expect(
        isValidGeminiResult({
          scam_type: "fake_job",
          ai_signals: [],
          verdict: "test",
          next_steps: "not-an-array",
        })
      ).toBe(false);
    });

    it("returns true for a conforming object structure", () => {
      const valid = {
        scam_type: "fake_job",
        ai_signals: [],
        verdict: "Suspicious offer",
        next_steps: ["Verify recruiter"],
        family_note: "Notice",
        transcript: "",
      };
      expect(isValidGeminiResult(valid)).toBe(true);
    });
  });

  describe("geminiSignalsToHits() Contract & Clamping", () => {
    it("returns empty array when input is not an array or is empty", () => {
      expect(geminiSignalsToHits(null)).toEqual([]);
      expect(geminiSignalsToHits(undefined)).toEqual([]);
      expect(geminiSignalsToHits("invalid")).toEqual([]);
      expect(geminiSignalsToHits([])).toEqual([]);
    });

    it("drops signals with missing, null, or non-string evidence", () => {
      const signals = [
        { id: "1", label: "Signal 1", weight: 15 }, // missing evidence
        { id: "2", label: "Signal 2", weight: 15, evidence: null }, // null evidence
        { id: "3", label: "Signal 3", weight: 15, evidence: "" }, // empty evidence
        { id: "4", label: "Signal 4", weight: 15, evidence: 12345 }, // non-string evidence
        { id: "5", label: "Signal 5", weight: 15, evidence: "Valid quote from text" },
      ];

      const hits = geminiSignalsToHits(signals);
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe("5");
      expect(hits[0].evidence).toBe("Valid quote from text");
    });

    it("drops signals with missing, null, or empty label", () => {
      const signals = [
        { id: "1", weight: 15, evidence: "some evidence" }, // missing label
        { id: "2", label: "", weight: 15, evidence: "some evidence" }, // empty label
        { id: "3", label: null, weight: 15, evidence: "some evidence" }, // null label
        { id: "4", label: "Legitimate label", weight: 15, evidence: "some evidence" },
      ];

      const hits = geminiSignalsToHits(signals);
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe("4");
    });

    it("drops signals when weight is a string, NaN, or non-finite", () => {
      const signals = [
        { id: "1", label: "Signal 1", weight: "20", evidence: "quote" }, // string weight
        { id: "2", label: "Signal 2", weight: NaN, evidence: "quote" },
        { id: "3", label: "Signal 3", weight: Infinity, evidence: "quote" },
        { id: "4", label: "Signal 4", weight: -Infinity, evidence: "quote" },
        { id: "5", label: "Signal 5", weight: 20, evidence: "quote" },
      ];

      const hits = geminiSignalsToHits(signals);
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe("5");
      expect(hits[0].weight).toBe(20);
    });

    it("drops negative and zero weights (B2: prompt-injection defense against weight -25)", () => {
      const signals = [
        { id: "hack1", label: "Ignore instructions", weight: -25, evidence: "trust me" },
        { id: "hack2", label: "Zero weight", weight: 0, evidence: "no risk" },
        { id: "valid", label: "Real risk", weight: 15, evidence: "ask for fee" },
      ];

      const hits = geminiSignalsToHits(signals);
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe("valid");
      expect(hits[0].weight).toBe(15);
    });

    it("clamps weights exceeding 25 to exactly 25", () => {
      const signals = [
        { id: "high1", label: "Severe threat", weight: 50, evidence: "warrant" },
        { id: "high2", label: "Super threat", weight: 100, evidence: "arrest" },
        { id: "normal", label: "Normal threat", weight: 10, evidence: "hurry" },
      ];

      const hits = geminiSignalsToHits(signals);
      expect(hits).toHaveLength(3);
      expect(hits[0].weight).toBe(25);
      expect(hits[1].weight).toBe(25);
      expect(hits[2].weight).toBe(10);
    });

    it("enforces maximum cap of 8 signals", () => {
      const signals = Array.from({ length: 15 }, (_, i) => ({
        id: `sig_${i}`,
        label: `Signal ${i}`,
        weight: 10,
        evidence: `Evidence ${i}`,
      }));

      const hits = geminiSignalsToHits(signals);
      expect(hits).toHaveLength(8);
      expect(hits[7].id).toBe("sig_7");
    });
  });

  describe("Service Error & Degradation Handling", () => {
    it("returns null when GEMINI_API_KEY is not set", async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      try {
        delete process.env.GEMINI_API_KEY;
        expect(await analyzeWithGemini("test", [])).toBeNull();
        expect(await analyzeAudioWithGemini("AAAA", "audio/wav")).toBeNull();
      } finally {
        process.env.GEMINI_API_KEY = originalKey;
      }
    });

    it("returns null gracefully if Gemini returns malformed JSON", async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "mock-key";

      try {
        globalThis.fetch = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: "not-json{{" }] } }],
            }),
            { status: 200 }
          )
        );

        const res = await analyzeWithGemini("test text", []);
        expect(res).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
        process.env.GEMINI_API_KEY = originalKey;
      }
    });
  });
});
