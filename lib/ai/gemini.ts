import type { RuleHit } from "../rules/types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a senior fraud analyst specializing in scams targeting Indians
(WhatsApp forwards, fake internships, digital arrest, UPI fraud, Hinglish messages).
Rules:
- Only report signals with concrete evidence present in the message. Never invent quotes.
- Each signal weight: 5 (mild) to 25 (strong). Never exceed 25.
- Do not duplicate obvious keyword hits already flagged by the rule engine; focus on tone,
  coercion, vagueness, and channel mismatch.
- If the message appears genuine, set scam_type to "genuine" and return an empty ai_signals array.
- next_steps: 2-4 short, concrete actions. When risk is high, include official reporting:
  call 1930 / visit cybercrime.gov.in.
- family_note: 1-2 simple sentences in easy Hinglish (Latin script) that a parent can understand.
- speech_detected: boolean. Set to true ONLY if intelligible human speech is present. If the audio contains only silence, background noise, or music, set to false. For text input, set to true.
- transcript: for audio input, verbatim transcription of everything said in the audio. Transcribe in romanized Hinglish (Latin script) keeping the speaker's words verbatim, so downstream rule matching can operate effectively. If speech_detected is false, return an empty transcript "" and set scam_type to "none", verdict to "No speech detected.", ai_signals to [], next_steps to [], family_note to "". For text input, an empty string "".`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    speech_detected: { type: "BOOLEAN" },
    scam_type: {
      type: "STRING",
      enum: [
        "digital_arrest",
        "fake_job",
        "task_scam",
        "investment",
        "kyc_utility",
        "upi_collect",
        "loan_app",
        "voice_clone",
        "fake_support",
        "phishing",
        "unknown",
        "genuine",
        "none",
      ],
    },
    ai_signals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          label: { type: "STRING" },
          weight: { type: "NUMBER" },
          evidence: { type: "STRING" },
        },
        required: ["id", "label", "weight", "evidence"],
      },
    },
    verdict: { type: "STRING" },
    next_steps: { type: "ARRAY", items: { type: "STRING" } },
    family_note: { type: "STRING" },
    transcript: { type: "STRING" },
  },
  required: [
    "speech_detected",
    "scam_type",
    "ai_signals",
    "verdict",
    "next_steps",
    "family_note",
    "transcript",
  ],
};

export interface GeminiResult {
  speech_detected?: boolean;
  scam_type: string;
  ai_signals: { id: string; label: string; weight: number; evidence: string }[];
  verdict: string;
  next_steps: string[];
  family_note: string;
  transcript: string;
}

export class GeminiServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GeminiServiceError";
  }
}

function isValidGeminiResult(data: unknown): data is GeminiResult {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.scam_type === "string" &&
    Array.isArray(d.ai_signals) &&
    typeof d.verdict === "string" &&
    Array.isArray(d.next_steps)
  );
}

export async function analyzeWithGemini(
  text: string,
  ruleLabels: string[]
): Promise<GeminiResult | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const flaggedInfo =
      ruleLabels.length > 0 ? ruleLabels.join("; ") : "nothing";

    const prompt = `${SYSTEM_PROMPT}\n\nRule engine already flagged: ${flaggedInfo}.\n\nMESSAGE TO ANALYZE:\n"""\n${text}\n"""`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(GEMINI_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!isValidGeminiResult(parsed)) return null;

    if (!parsed.transcript) {
      parsed.transcript = "";
    }
    return parsed;
  } catch {
    // Graceful degradation — rules-only mode
    return null;
  }
}

export async function analyzeAudioWithGemini(
  base64: string,
  mimeType: string
): Promise<GeminiResult | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const promptText = `${SYSTEM_PROMPT}\n\nFirst transcribe the audio verbatim in romanized Hinglish (Latin script), keeping the speaker's words exactly as spoken, and check for intelligible human speech. Set speech_detected to true ONLY if intelligible human speech is present. If the audio contains only silence, music, background noise, or no intelligible speech, you MUST set speech_detected to false, return an empty transcript "", and empty ai_signals []. Then analyze the transcript as the message to analyze, following all the same rules.`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(GEMINI_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      if (res.status === 429 || res.status === 503) {
        throw new GeminiServiceError(
          503,
          "The voice service is busy or at its limit. Please try again later."
        );
      }
      return null;
    }

    const data = await res.json().catch(() => null);
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!isValidGeminiResult(parsed)) return null;

    if (!parsed.transcript) {
      parsed.transcript = "";
    }
    return parsed;
  } catch (err) {
    if (err instanceof GeminiServiceError) {
      throw err;
    }
    return null;
  }
}

export function geminiSignalsToHits(
  signals: GeminiResult["ai_signals"]
): RuleHit[] {
  return signals.map((s) => ({
    id: s.id,
    label: s.label,
    category: "ai",
    weight: Number(s.weight),
    evidence: s.evidence.length > 80 ? s.evidence.slice(0, 80) + "…" : s.evidence,
  }));
}
