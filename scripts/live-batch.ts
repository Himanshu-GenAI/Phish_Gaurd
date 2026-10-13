import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, basename, extname } from "path";

interface AudioConfigItem {
  name?: string;
  path: string;
  mime?: string;
  mimeType?: string;
}

interface BatchItem {
  name: string;
  type: "text" | "audio";
  payload: { text?: string; audio?: string; mimeType?: string };
  preview: string;
}

interface AnalysisResponse {
  trust?: number;
  band?: string;
  scam_type?: string;
  flags?: Array<{ id: string; label: string; points: number; evidence?: string }>;
  verdict?: string;
  next_steps?: string[];
  family_note?: string;
  transcript?: string | null;
  degraded?: string[];
  breakdown?: {
    rules: number;
    rdap: number;
    ai: number;
    raw_risk?: number;
    risk?: number;
    degraded?: string[];
  };
  noSpeech?: boolean;
  message?: string;
  error?: string;
}

interface RowResult {
  name: string;
  http: string;
  degraded: string;
  rules: string;
  rdap: string;
  ai: string;
  raw_risk: string;
  risk: string;
  trust: string;
  band: string;
  preview: string;
}

const ROOT = resolve(import.meta.dirname, "..");
const CACHE_DIR = resolve(ROOT, "eval/cache");
const CONFIG_FILE = resolve(ROOT, "scripts/live-batch.config.json");
const SAMPLES_DIR = resolve(ROOT, "samples");
const API_URL = process.env.APP_URL ? `${process.env.APP_URL}/api/analyze` : "http://localhost:3000/api/analyze";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeForCache(data: AnalysisResponse) {
  // Save numbers, flags, transcript, etc. Never API keys, auth headers, or raw request metadata
  return {
    trust: data.trust,
    band: data.band,
    scam_type: data.scam_type,
    flags: data.flags,
    verdict: data.verdict,
    next_steps: data.next_steps,
    family_note: data.family_note,
    transcript: data.transcript,
    degraded: data.degraded,
    breakdown: data.breakdown,
    noSpeech: data.noSpeech,
    message: data.message,
  };
}

async function main() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const items: BatchItem[] = [];

  // 1. Text samples from samples/
  if (existsSync(SAMPLES_DIR)) {
    const files = readdirSync(SAMPLES_DIR)
      .filter((f) => f.endsWith(".txt"))
      .sort();

    for (const file of files) {
      const name = basename(file, ".txt");
      const text = readFileSync(resolve(SAMPLES_DIR, file), "utf-8").trim();
      items.push({
        name,
        type: "text",
        payload: { text },
        preview: text.replace(/\s+/g, " ").slice(0, 80),
      });
    }
  }

  // 2. Audio files from scripts/live-batch.config.json
  if (existsSync(CONFIG_FILE)) {
    try {
      const rawConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      if (Array.isArray(rawConfig)) {
        for (const item of rawConfig as AudioConfigItem[]) {
          if (!item.path) continue;
          const fullPath = resolve(ROOT, item.path);
          if (!existsSync(fullPath)) {
            console.warn(`[live-batch] Warning: Audio file not found: ${fullPath}`);
            continue;
          }
          const ext = extname(fullPath).toLowerCase();
          const mime = item.mime || item.mimeType || (ext === ".wav" ? "audio/wav" : ext === ".mp3" ? "audio/mp3" : "audio/ogg");
          const name = item.name || basename(fullPath, extname(fullPath));
          const audioB64 = readFileSync(fullPath).toString("base64");
          items.push({
            name,
            type: "audio",
            payload: { audio: audioB64, mimeType: mime },
            preview: `[audio: ${basename(fullPath)} (${mime})]`,
          });
        }
      }
    } catch (err: unknown) {
      console.error("[live-batch] Failed to parse scripts/live-batch.config.json:", (err as Error).message);
    }
  }

  console.log(`[live-batch] Loaded ${items.length} items to evaluate against ${API_URL}`);
  console.log(`[live-batch] Cache directory: ${CACHE_DIR}\n`);

  const results: RowResult[] = [];
  let liveCallCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cacheFile = resolve(CACHE_DIR, `${item.name}.json`);

    // Check cache first
    if (existsSync(cacheFile)) {
      try {
        const cached: AnalysisResponse = JSON.parse(readFileSync(cacheFile, "utf-8"));
        results.push({
          name: item.name,
          http: "CACHE",
          degraded: cached.degraded?.length ? cached.degraded.join(",") : "none",
          rules: cached.breakdown?.rules !== undefined ? String(cached.breakdown.rules) : "-",
          rdap: cached.breakdown?.rdap !== undefined ? String(cached.breakdown.rdap) : "-",
          ai: cached.breakdown?.ai !== undefined ? String(cached.breakdown.ai) : "-",
          raw_risk: cached.breakdown?.raw_risk !== undefined ? String(cached.breakdown.raw_risk) : "-",
          risk: cached.breakdown?.risk !== undefined ? String(cached.breakdown.risk) : "-",
          trust: cached.trust !== undefined ? String(cached.trust) : "-",
          band: cached.band || "-",
          preview: (cached.transcript || item.preview).slice(0, 80),
        });
        console.log(`[${i + 1}/${items.length}] ${item.name}: Found cached response, skipping API call.`);
        continue;
      } catch {
        console.warn(`[live-batch] Cache read error for ${item.name}, will re-request.`);
      }
    }

    // Call /api/analyze
    console.log(`[${i + 1}/${items.length}] ${item.name}: Calling /api/analyze (${item.type})...`);
    liveCallCount++;

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e: unknown) {
      const err = e as { message?: string; cause?: { code?: string } };
      const isConnRefused =
        err?.cause?.code === "ECONNREFUSED" ||
        err?.message?.includes("fetch failed") ||
        err?.message?.includes("ECONNREFUSED");

      if (isConnRefused) {
        console.error(`\n[live-batch] Error: Cannot connect to server at ${API_URL}.`);
        console.error(`[live-batch] Is the local development server running? Start it with 'npm run dev' before running this script.\n`);
        process.exit(1);
      }

      console.error(`[live-batch] Network/Connection error on ${item.name}:`, (e as Error).message);
      results.push({
        name: item.name,
        http: "ERR",
        degraded: "-",
        rules: "-",
        rdap: "-",
        ai: "-",
        raw_risk: "-",
        risk: "-",
        trust: "-",
        band: "-",
        preview: (e as Error).message.slice(0, 80),
      });
      continue;
    }

    if (res.status === 429) {
      console.error(`\n[live-batch] HTTP 429 (Rate/Quota Limit) encountered on '${item.name}'!`);
      console.error(`[live-batch] Live calls attempted: ${liveCallCount}`);
      console.error(`[live-batch] Stopping batch immediately to prevent further quota degradation.\n`);
      results.push({
        name: item.name,
        http: "429",
        degraded: "-",
        rules: "-",
        rdap: "-",
        ai: "-",
        raw_risk: "-",
        risk: "-",
        trust: "-",
        band: "-",
        preview: "HTTP 429 Quota Exceeded",
      });
      break;
    }

    let data: AnalysisResponse = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (res.ok) {
      const sanitized = sanitizeForCache(data);
      writeFileSync(cacheFile, JSON.stringify(sanitized, null, 2), "utf-8");
      console.log(`  Saved response to eval/cache/${item.name}.json`);
    } else {
      console.warn(`  HTTP ${res.status}: ${data.error || res.statusText}`);
    }

    results.push({
      name: item.name,
      http: String(res.status),
      degraded: data.degraded?.length ? data.degraded.join(",") : "none",
      rules: data.breakdown?.rules !== undefined ? String(data.breakdown.rules) : "-",
      rdap: data.breakdown?.rdap !== undefined ? String(data.breakdown.rdap) : "-",
      ai: data.breakdown?.ai !== undefined ? String(data.breakdown.ai) : "-",
      raw_risk: data.breakdown?.raw_risk !== undefined ? String(data.breakdown.raw_risk) : "-",
      risk: data.breakdown?.risk !== undefined ? String(data.breakdown.risk) : "-",
      trust: data.trust !== undefined ? String(data.trust) : "-",
      band: data.band || "-",
      preview: (data.transcript || item.preview).slice(0, 80),
    });

    // Wait 15 seconds before next live call if more items remain
    const remainingUncached = items.slice(i + 1).some((rem) => !existsSync(resolve(CACHE_DIR, `${rem.name}.json`)));
    if (remainingUncached) {
      console.log("  Waiting 15s before next request (respecting rate limits)...");
      await sleep(15000);
    }
  }

  // Print summary table
  console.log("\n" + "=".repeat(120));
  console.log("BATCH EVALUATION SUMMARY TABLE");
  console.log("=".repeat(120));

  const headers = ["name", "HTTP", "degraded", "rules", "rdap", "ai", "raw_risk", "risk", "trust", "band", "transcript preview (80 chars)"];
  const rows = results.map((r) => [
    r.name,
    r.http,
    r.degraded,
    r.rules,
    r.rdap,
    r.ai,
    r.raw_risk,
    r.risk,
    r.trust,
    r.band,
    r.preview,
  ]);

  // Compute column widths
  const colWidths = headers.map((h, colIdx) => {
    const maxVal = Math.max(...rows.map((row) => (row[colIdx] || "").length), h.length);
    return Math.min(maxVal, colIdx === 10 ? 80 : 30);
  });

  const formatRow = (cols: string[]) =>
    cols.map((col, idx) => (col || "").padEnd(colWidths[idx]).slice(0, colWidths[idx])).join(" | ");

  console.log(formatRow(headers));
  console.log(colWidths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) {
    console.log(formatRow(row));
  }
  console.log("=".repeat(120));
  console.log(`Total live calls made in this run: ${liveCallCount}`);
}

main().catch((e) => {
  console.error("[live-batch] Unhandled failure:", e);
  process.exit(1);
});
