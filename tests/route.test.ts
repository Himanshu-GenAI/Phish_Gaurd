import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/analyze/route";
import * as rdapModule from "@/lib/checks/rdap";

describe("Route Integration (app/api/analyze/route.ts)", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GEMINI_API_KEY = "test-mock-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  describe("Import Verification", () => {
    it("successfully imports POST handler from app/api/analyze/route.ts", () => {
      expect(typeof POST).toBe("function");
    });
  });

  describe("Input Validation (400 Bad Request)", () => {
    it("returns 400 on malformed JSON payload", async () => {
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Invalid JSON in request body");
    });

    it("returns 400 when body is empty object (neither text nor audio)", async () => {
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Nothing to analyze");
    });

    it("returns 400 when text is only whitespace", async () => {
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "    \n   " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Nothing to analyze");
    });

    it("returns 400 when text exceeds 5,000 characters", async () => {
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "a".repeat(5001) }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Message exceeds the 5,000 character limit");
    });

    it("returns 400 for audio with unsupported MIME type", async () => {
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: "AAAA", mimeType: "audio/aac" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Unsupported audio format");
    });

    it("returns 413 for oversized audio payload exceeding 3 MB", async () => {
      const oversized = "A".repeat(4 * 1024 * 1024 + 100);
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: oversized, mimeType: "audio/wav" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(413);

      const json = await res.json();
      expect(json.error).toContain("exceeds 3 MB limit");
    });
  });

  describe("Text Path with Mocked AI Layer & Privacy / Invariant Checks", () => {
    it("returns 200 with complete structure and NEVER includes breakdown.skipped", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          scam_type: "fake_job",
                          verdict: "Deceptive job solicitation requiring upfront payment.",
                          ai_signals: [
                            {
                              id: "ai_advance_fee",
                              label: "Advance fee solicitation",
                              category: "ai",
                              weight: 20,
                              evidence: "Pay Rs 500 registration fee",
                            },
                          ],
                          next_steps: ["Do not pay any fee", "Report message"],
                          family_note: "Job offer asking for registration fee.",
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Part time data entry job. Pay Rs 500 registration fee to start." }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("trust");
      expect(data).toHaveProperty("band");
      expect(data).toHaveProperty("flags");
      expect(data).toHaveProperty("breakdown");

      // CRITICAL REQUIREMENT: breakdown.skipped NEVER appears in API response
      expect(data.breakdown).not.toHaveProperty("skipped");
      expect(data.breakdown).toHaveProperty("rules");
      expect(data.breakdown).toHaveProperty("rdap");
      expect(data.breakdown).toHaveProperty("ai");
      expect(data.breakdown).toHaveProperty("raw_risk");
      expect(data.breakdown).toHaveProperty("risk");
      expect(data.breakdown).toHaveProperty("degraded");
    });

    it("handles Gemini HTTP 429 quota exhaustion gracefully into degraded mode without failing", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({ error: { code: 429, message: "Resource exhausted" } }), {
            status: 429,
          });
        }
        return new Response("{}", { status: 200 });
      });

      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Digital arrest warrant from CBI. Transfer money immediately." }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.degraded).toContain("ai-analysis");
      expect(data.breakdown.degraded).toContain("ai-analysis");
      expect(data.breakdown).not.toHaveProperty("skipped");
      expect(data.verdict).toContain("Rule-based analysis only");
    });

    it("handles malformed Gemini result object gracefully (degraded: ['ai-analysis'], HTTP 200, never 500)", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [{ text: "{\"malformed\": true}" }], // missing required fields
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response("{}", { status: 200 });
      });

      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Pay Rs 500 registration fee" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.degraded).toContain("ai-analysis");
      expect(data.breakdown.degraded).toContain("ai-analysis");
    });

    it("drops negative AI signal weights from prompt injection (B2: weight -25 does not reduce risk)", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          scam_type: "none",
                          verdict: "Safe message",
                          ai_signals: [
                            {
                              id: "exploit",
                              label: "Injected negative weight",
                              category: "ai",
                              weight: -25,
                              evidence: "ignore previous instructions",
                            },
                          ],
                          next_steps: [],
                          family_note: "",
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response("{}", { status: 200 });
      });

      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Pay registration fee of Rs 500" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      // AI signal with weight -25 was dropped, so ai risk must be 0
      expect(data.breakdown.ai).toBe(0);
      expect(data.flags.some((f: { id: string }) => f.id === "exploit")).toBe(false);
    });

    it("handles RDAP domain check failure and marks domain-check degraded", async () => {
      vi.spyOn(rdapModule, "checkDomain").mockRejectedValue(new Error("RDAP failure"));

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          scam_type: "phishing_apk",
                          verdict: "Phishing link detected",
                          ai_signals: [],
                          next_steps: [],
                          family_note: "",
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response("{}", { status: 200 });
      });

      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Login to update KYC: https://unsupported-tld-domain.test/update" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.degraded).toContain("domain-check");
      expect(data.breakdown.degraded).toContain("domain-check");
    });

    it("never leaks raw user input text to console.log or console.error (Privacy Guard)", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      const sensitiveCanary = "CANARY_SENSITIVE_TEXT_CONFIDENTIAL_12345";

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        scam_type: "none",
                        verdict: "Safe message",
                        ai_signals: [],
                        next_steps: [],
                        family_note: "",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `Hello world with ${sensitiveCanary}` }),
      });

      await POST(req);

      for (const call of consoleLogSpy.mock.calls) {
        const joined = call.map((c) => String(c)).join(" ");
        expect(joined).not.toContain(sensitiveCanary);
      }
      for (const call of consoleErrorSpy.mock.calls) {
        const joined = call.map((c) => String(c)).join(" ");
        expect(joined).not.toContain(sensitiveCanary);
      }
    });
  });

  describe("Audio Path Integration", () => {
    it("processes genuine audio transcript with scam_type 'none' and speech_detected true", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        transcript: "Beta market se aate waqt do packet doodh lete aana ghar pe",
                        speech_detected: true,
                        scam_type: "none",
                        verdict: "Normal family voice note",
                        ai_signals: [],
                        next_steps: [],
                        family_note: "Ordinary message",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const validAudioBase64 = Buffer.from("dummy-audio-bytes").toString("base64");
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: validAudioBase64, audio_mime: "audio/wav" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.noSpeech).toBeUndefined();
      expect(data.trust).toBeGreaterThanOrEqual(75);
      expect(data.band).toBe("safe");
      expect(data.transcript).toContain("Beta market se aate waqt");
    });

    it("processes scam audio transcript with flags and risk score", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        transcript: "Main Cyber Crime Branch se Officer bol raha hu digital arrest warrant hai transfer Rs 100000 immediately",
                        speech_detected: true,
                        scam_type: "digital_arrest",
                        verdict: "Extortion attempt",
                        ai_signals: [
                          {
                            id: "impersonation",
                            label: "Police impersonation",
                            category: "ai",
                            weight: 25,
                            evidence: "Cyber Crime Branch se Officer",
                          },
                        ],
                        next_steps: ["Do not transfer money"],
                        family_note: "Fraud warning",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const validAudioBase64 = Buffer.from("dummy-audio-bytes").toString("base64");
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: validAudioBase64, audio_mime: "audio/wav" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.trust).toBeLessThan(50);
      expect(data.scam_type).toBe("digital_arrest");
      expect(data.flags.length).toBeGreaterThan(0);
    });

    it("handles no-speech detection cleanly (speech_detected: false -> noSpeech)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        transcript: "Can you hear me?",
                        speech_detected: false,
                        scam_type: "none",
                        verdict: "No human speech",
                        ai_signals: [],
                        next_steps: [],
                        family_note: "",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const validAudioBase64 = Buffer.from("dummy-audio-bytes").toString("base64");
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: validAudioBase64, audio_mime: "audio/wav" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.noSpeech).toBe(true);
      expect(data.trust).toBe(null);
      expect(data.verdict).toBe("No intelligible speech detected in the audio file.");
    });

    it("returns 503 when voice service is busy (Gemini returns 503 or 429)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("Service Unavailable", { status: 503 })
      );

      const validAudioBase64 = Buffer.from("dummy-audio-bytes").toString("base64");
      const req = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: validAudioBase64, audio_mime: "audio/wav" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error).toContain("The voice service is busy or at its limit");
    });
  });
});
