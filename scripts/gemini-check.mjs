import { readFileSync, existsSync, statSync } from "fs";
import { resolve, extname } from "path";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: node scripts/gemini-check.mjs [env-dir-or-file] [path-to-audio] [options]

Arguments:
  [env-dir-or-file]  Path to repo root directory containing .env.local, or path to .env file (default: ".")
  [path-to-audio]    Optional audio file to test inline_data transcription (.wav, .mp3, .ogg, .opus, etc.)

Options:
  --help, -h         Show this help message
  --dry-run          Verify arguments and environment key without making Gemini API calls
  --only-audio       Skip text/JSON tests and test audio only
`);
  process.exit(0);
}

const isDryRun = process.argv.includes("--dry-run");

let envArg = process.argv[2];
if (envArg && (envArg.startsWith("--") || [".wav", ".ogg", ".opus", ".mp3", ".aac", ".flac"].some(ext => envArg.toLowerCase().endsWith(ext)))) {
  envArg = ".";
}

let envPath = resolve(envArg || ".");
if (existsSync(envPath) && statSync(envPath).isDirectory()) {
  envPath = resolve(envPath, ".env.local");
} else if (!existsSync(envPath)) {
  const candidate = resolve(envArg || ".", ".env.local");
  if (existsSync(candidate)) {
    envPath = candidate;
  }
}

let apiKey;
try {
  apiKey = readFileSync(envPath, "utf-8")
    .match(/^GEMINI_API_KEY=(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
} catch { console.error("Could not read", envPath); process.exit(1); }
if (!apiKey) { console.error("GEMINI_API_KEY not found in", envPath); process.exit(1); }

if (isDryRun) {
  console.log(`[DRY-RUN] Successfully loaded API key (${apiKey.length} chars) from ${envPath}`);
  console.log(`[DRY-RUN] Target model: ${process.env.GEMINI_MODEL || "gemini-3.8-flash"}`);
  console.log(`[DRY-RUN] No Gemini API calls made.`);
  process.exit(0);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const redact = (s) => String(s).split(apiKey).join("[REDACTED]");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(name, body) {
  let attempt = 0;
  let retries503 = 0;
  let retries429 = 0;

  while (true) {
    attempt++;
    try {
      console.log(`[${name}] Attempt ${attempt} sending request...`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json().catch(() => ({}));
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const hint = res.status === 404 ? "model retired or wrong name"
        : res.status === 429 ? "quota/rate limit (model exists)"
        : res.status === 503 ? "service overloaded"
        : res.status === 400 || res.status === 403 ? "bad request or key problem" : "";

      console.log(`[${name}] Attempt ${attempt}: HTTP ${res.status} ${res.ok ? "OK" : "FAIL"} ${hint}`);

      if (res.ok) {
        console.log("  transcript/response (first 100 chars):", redact(text || "").slice(0, 100));
        return { ok: true, status: res.status, text };
      }

      console.log("  error:", redact(JSON.stringify(data?.error ?? data)).slice(0, 400));

      if (res.status === 503 && retries503 < 2) {
        retries503++;
        console.log(`[${name}] 503 received. Backing off 10s (retry ${retries503}/2)...`);
        await sleep(10000);
        continue;
      }

      if (res.status === 429 && retries429 < 1) {
        retries429++;
        console.log(`[${name}] 429 received. Waiting 60s for quota reset (retry 1/1)...`);
        await sleep(60000);
        continue;
      }

      return { ok: false, status: res.status, error: data?.error ?? data };
    } catch (e) {
      console.log(`[${name}] Attempt ${attempt} ${e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK ERROR"}:`, redact(e.message));
      return { ok: false, status: 0, error: e.message };
    }
  }
}

console.log("Model:", MODEL, "| key length:", apiKey.length);

const audioPath = process.argv[3];
const onlyAudio = process.argv.includes("--only-audio");

let plain = true;
let structured = true;

if (!onlyAudio) {
  const plainRes = await callWithRetry("plain text", {
    contents: [{ parts: [{ text: "Reply with exactly: ALIVE" }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 10 },
  });
  plain = plainRes.ok;

  console.log("Waiting 15s between requests to respect 5 RPM quota...");
  await sleep(15000);

  const structuredRes = await callWithRetry("structured JSON", {
    contents: [{ parts: [{ text: "Rate this message 0-10 for scam risk: 'Pay Rs 499 fee to get the job'" }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: { score: { type: "INTEGER" }, reason: { type: "STRING" } },
        required: ["score", "reason"],
      },
    },
  });
  structured = structuredRes.ok;

  if (audioPath) {
    console.log("Waiting 15s before audio request...");
    await sleep(15000);
  }
}

let audio = "SKIPPED";
if (audioPath) {
  const ext = extname(audioPath).toLowerCase();
  const mimeMap = {
    ".aac": "audio/aac",
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".flac": "audio/flac",
  };

  const mime = mimeMap[ext] || "audio/ogg";
  console.log(`\nTesting audio file: ${audioPath}`);
  console.log(`  Extension: ${ext}`);
  console.log(`  MIME sent: ${mime}`);

  const b64 = readFileSync(audioPath).toString("base64");
  const audioRes = await callWithRetry("audio inline_data", {
    contents: [{ parts: [
      { inline_data: { mime_type: mime, data: b64 } },
      { text: "Transcribe this audio verbatim." },
    ] }],
  });

  audio = audioRes.ok ? "OK" : `FAIL (${audioRes.status})`;
}

console.log("\nSUMMARY:", { plain, structured, audio });
