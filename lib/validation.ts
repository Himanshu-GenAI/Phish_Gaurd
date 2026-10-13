export const MAX_TEXT_LENGTH = 5000;
export const MAX_RAW_AUDIO_BYTES = 3 * 1024 * 1024; // 3 MB limit (3,145,728 bytes)

export const ALLOWED_AUDIO_MIMES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/aiff",
  "audio/x-aiff",
  "audio/flac",
  "audio/x-flac",
]);

export function countUnicodeLetters(text: string): number {
  return (text.match(/[\p{L}\p{M}]/gu) || []).length;
}

export function shouldTriggerNoSpeech(params: {
  speech_detected?: boolean;
  transcript?: string;
}): boolean {
  if (params.speech_detected === false) return true;
  const t = (params.transcript || "").trim();
  if (t.length === 0) return true;
  const letters = countUnicodeLetters(t);
  return letters < 5;
}

export interface TextValidationResult {
  valid: boolean;
  text?: string;
  error?: string;
  status?: number;
}

export function validateText(rawText: unknown): TextValidationResult {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return {
      valid: false,
      error: "Nothing to analyze",
      status: 400,
    };
  }

  const text = rawText.trim();
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Message exceeds the ${MAX_TEXT_LENGTH.toLocaleString()} character limit. Please shorten your message.`,
      status: 400,
    };
  }

  return {
    valid: true,
    text,
  };
}

export interface AudioValidationResult {
  valid: boolean;
  cleanBase64?: string;
  targetMime?: string;
  buffer?: Buffer;
  error?: string;
  status?: number;
}

export function validateAudio(rawAudio: unknown, rawMime: unknown): AudioValidationResult {
  if (typeof rawAudio !== "string" || !rawAudio.trim()) {
    return {
      valid: false,
      error: "Audio payload is empty or invalid base64",
      status: 400,
    };
  }

  const audioMime = (typeof rawMime === "string" ? rawMime : "audio/ogg").toLowerCase().trim();
  if (!ALLOWED_AUDIO_MIMES.has(audioMime)) {
    return {
      valid: false,
      error:
        "Unsupported audio format. WAV is verified; MP3 and OGG/OPUS are expected to work, pending live verification (FLAC and AIFF untested).",
      status: 400,
    };
  }

  // Map .opus / audio/opus to audio/ogg for Gemini REST API
  const targetMime = audioMime === "audio/opus" ? "audio/ogg" : audioMime;

  let cleanBase64 = rawAudio;
  if (cleanBase64.includes("base64,")) {
    cleanBase64 = cleanBase64.split("base64,")[1];
  }
  cleanBase64 = cleanBase64.trim();

  // Allocation guard: estimate decoded size before allocating a buffer
  // Standard base64 encodes 3 bytes into 4 characters
  const estimatedDecodedBytes = Math.floor((cleanBase64.length * 3) / 4);
  if (estimatedDecodedBytes > MAX_RAW_AUDIO_BYTES) {
    return {
      valid: false,
      error: "Audio file exceeds 3 MB limit (Vercel payload constraint). Please upload a smaller file.",
      status: 413,
    };
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(cleanBase64, "base64");
    if (audioBuffer.length === 0) {
      return {
        valid: false,
        error: "Audio payload is empty or invalid base64",
        status: 400,
      };
    }
  } catch {
    return {
      valid: false,
      error: "Failed to decode audio base64 payload",
      status: 400,
    };
  }

  if (audioBuffer.length > MAX_RAW_AUDIO_BYTES) {
    return {
      valid: false,
      error: "Audio file exceeds 3 MB limit (Vercel payload constraint). Please upload a smaller file.",
      status: 413,
    };
  }

  return {
    valid: true,
    cleanBase64,
    targetMime,
    buffer: audioBuffer,
  };
}
