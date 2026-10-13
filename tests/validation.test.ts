import { describe, it, expect, vi } from "vitest";
import {
  validateText,
  validateAudio,
  shouldTriggerNoSpeech,
  countUnicodeLetters,
  MAX_TEXT_LENGTH,
} from "@/lib/validation";

describe("Validation Layer (lib/validation)", () => {
  describe("validateText()", () => {
    it("rejects non-string inputs with status 400", () => {
      expect(validateText(null)).toEqual({ valid: false, error: "Nothing to analyze", status: 400 });
      expect(validateText(undefined)).toEqual({ valid: false, error: "Nothing to analyze", status: 400 });
      expect(validateText(12345)).toEqual({ valid: false, error: "Nothing to analyze", status: 400 });
      expect(validateText({})).toEqual({ valid: false, error: "Nothing to analyze", status: 400 });
    });

    it("rejects empty or whitespace-only strings with status 400", () => {
      expect(validateText("")).toEqual({ valid: false, error: "Nothing to analyze", status: 400 });
      expect(validateText("   \n\t  ")).toEqual({ valid: false, error: "Nothing to analyze", status: 400 });
    });

    it("trims valid text within 5,000 characters", () => {
      const res = validateText("  Hello, this is a test.  ");
      expect(res.valid).toBe(true);
      expect(res.text).toBe("Hello, this is a test.");
    });

    it("accepts text exactly at the 5,000-character boundary", () => {
      const exactText = "a".repeat(MAX_TEXT_LENGTH);
      const res = validateText(exactText);
      expect(res.valid).toBe(true);
      expect(res.text?.length).toBe(MAX_TEXT_LENGTH);
    });

    it("rejects text exceeding 5,000 characters with status 400", () => {
      const oversized = "a".repeat(MAX_TEXT_LENGTH + 1);
      const res = validateText(oversized);
      expect(res.valid).toBe(false);
      expect(res.status).toBe(400);
      expect(res.error).toContain("Message exceeds the 5,000 character limit");
    });
  });

  describe("validateAudio()", () => {
    it("rejects empty or non-string audio payloads", () => {
      expect(validateAudio("", "audio/wav").valid).toBe(false);
      expect(validateAudio(null, "audio/wav").valid).toBe(false);
      expect(validateAudio("   ", "audio/wav").valid).toBe(false);
    });

    it("rejects disallowed audio MIME types with status 400", () => {
      const disallowed = ["audio/aac", "audio/mp4", "audio/m4a", "video/mp4", "text/plain"];
      for (const mime of disallowed) {
        const res = validateAudio("AAAA", mime);
        expect(res.valid).toBe(false);
        expect(res.status).toBe(400);
        expect(res.error).toContain("Unsupported audio format");
      }
    });

    it("maps audio/opus to audio/ogg for Gemini REST API compatibility", () => {
      // 12 base64 chars = 9 decoded bytes
      const validBase64 = Buffer.from("test-audio").toString("base64");
      const res = validateAudio(validBase64, "audio/opus");
      expect(res.valid).toBe(true);
      expect(res.targetMime).toBe("audio/ogg");
    });

    it("strips data: URI base64 prefix", () => {
      const rawPayload = Buffer.from("audio-bytes").toString("base64");
      const dataUri = `data:audio/wav;base64,${rawPayload}`;
      const res = validateAudio(dataUri, "audio/wav");
      expect(res.valid).toBe(true);
      expect(res.cleanBase64).toBe(rawPayload);
    });

    it("rejects an oversized base64 string WITHOUT calling Buffer.from (allocation guard)", () => {
      // 3 MB = 3,145,728 bytes.
      // In base64, 4 characters decode to 3 bytes.
      // So 4,194,305 base64 characters estimate to Math.floor(4194305 * 3 / 4) = 3,145,728 bytes.
      // 4,194,320 base64 characters estimate to 3,145,740 bytes (> 3,145,728 bytes).
      const oversizedLength = 4 * 1024 * 1024 + 100; // ~4.19 MB of base64
      const oversizedBase64 = "A".repeat(oversizedLength);

      const bufferSpy = vi.spyOn(Buffer, "from");

      try {
        const res = validateAudio(oversizedBase64, "audio/wav");

        expect(res.valid).toBe(false);
        expect(res.status).toBe(413);
        expect(res.error).toContain("exceeds 3 MB limit");

        // CRITICAL ASSERTION: Buffer.from was never called, preventing V8 heap exhaustion
        expect(bufferSpy).not.toHaveBeenCalled();
      } finally {
        bufferSpy.mockRestore();
      }
    });
  });

  describe("No-Speech Guard (shouldTriggerNoSpeech & countUnicodeLetters)", () => {
    it("counts Unicode letters and combining marks (/[\\p{L}\\p{M}]/gu) across Latin and Indic scripts", () => {
      expect(countUnicodeLetters("Hello")).toBe(5);
      expect(countUnicodeLetters("Hi! 123")).toBe(2);
      expect(countUnicodeLetters("And")).toBe(3);
      // "नमस्ते बेटा": 6 letters + 4 combining marks = 10 characters
      expect(countUnicodeLetters("नमस्ते बेटा")).toBe(10);
      // "हाँ जी": ह (L) + ा (M) + ँ (M) + ज (L) + ी (M) = 5 characters
      expect(countUnicodeLetters("हाँ जी")).toBe(5);
    });

    it("triggers noSpeech when speech_detected is explicitly false", () => {
      expect(
        shouldTriggerNoSpeech({
          speech_detected: false,
          transcript: "Some text was recognized by hallucination",
        })
      ).toBe(true);
    });

    it("triggers noSpeech when transcript is empty or whitespace", () => {
      expect(
        shouldTriggerNoSpeech({
          speech_detected: true,
          transcript: "   ",
        })
      ).toBe(true);
    });

    it("triggers noSpeech for very short speech (< 5 Unicode letters/marks) such as 'Hi' and 'And'", () => {
      expect(shouldTriggerNoSpeech({ speech_detected: true, transcript: "Hi" })).toBe(true);
      expect(shouldTriggerNoSpeech({ speech_detected: true, transcript: "And" })).toBe(true);
      expect(shouldTriggerNoSpeech({ speech_detected: true, transcript: "Ok ok" })).toBe(true);
      expect(shouldTriggerNoSpeech({ speech_detected: true, transcript: "12345 67890" })).toBe(true);
    });

    it("does NOT trigger noSpeech for speech >= 5 Unicode letters/marks such as 'Hello' or 'हाँ जी'", () => {
      expect(shouldTriggerNoSpeech({ speech_detected: true, transcript: "Hello" })).toBe(false);
      expect(shouldTriggerNoSpeech({ speech_detected: true, transcript: "हाँ जी" })).toBe(false);
      expect(
        shouldTriggerNoSpeech({
          speech_detected: true,
          transcript: "Hello, this is officer Sharma calling",
        })
      ).toBe(false);
      expect(
        shouldTriggerNoSpeech({
          speech_detected: true,
          transcript: "नमस्ते बेटा घर आ जाओ",
        })
      ).toBe(false);
    });
  });
});
