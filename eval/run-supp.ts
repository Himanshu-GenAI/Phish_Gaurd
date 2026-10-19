import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { loadEnvConfig } from "@next/env";
import { runRules } from "../lib/rules/engine";
import { analyzeWithGemini, geminiSignalsToHits, GEMINI_MODEL, RuleHit, GeminiServiceError } from "../lib/ai/gemini";
import { analyzeText } from "../lib/analyze/pipeline";
import { wilsonScoreInterval, bootstrapRocAuc } from "./run";

loadEnvConfig(process.cwd());

const ROOT = resolve(process.cwd());
const CACHE_DIR = resolve(ROOT, "eval/cache_supp");
const RESULTS_DIR = resolve(ROOT, "eval/results");

if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}
if (!existsSync(RESULTS_DIR)) {
  mkdirSync(RESULTS_DIR, { recursive: true });
}

// Word 3-gram helper
function getWord3Grams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) {
    ngrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return ngrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function getCacheKey(model: string, text: string): string {
  const payload = `supp:${model}:1.0.0:${text}`;
  return createHash("sha256").update(payload, "utf-8").digest("hex");
}

export interface SuppItem {
  id: string;
  label: "scam" | "genuine";
  scam_type: string;
  text: string;
  [key: string]: unknown;
}

export async function runSupp() {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");
  const maxCallsIdx = args.indexOf("--max-calls");
  const maxCalls = maxCallsIdx !== -1 && args[maxCallsIdx + 1] ? parseInt(args[maxCallsIdx + 1], 10) : 80;

  console.log("======================================================================");
  console.log("ScamShield AI — Supplementary Evaluation Suite (npm run eval:supp)");
  console.log(`Mode: ${isLive ? "Rules + Live AI (--live)" : "Rules-Only (offline)"}`);
  console.log(`Max Live Calls: ${maxCalls} | Pacing: 4s | Stop on first 429`);
  console.log("======================================================================\n");

  // Load reference dev and test items for duplicate check
  const devItems: SuppItem[] = existsSync("eval/dataset/dev.json")
    ? JSON.parse(readFileSync("eval/dataset/dev.json", "utf-8"))
    : [];
  const testItems: SuppItem[] = existsSync("eval/dataset/test.json")
    ? JSON.parse(readFileSync("eval/dataset/test.json", "utf-8"))
    : [];
  const referenceItems = [...devItems, ...testItems].map((i) => ({
    id: i.id,
    grams: getWord3Grams(i.text),
  }));

  const setsToEvaluate = [
    {
      name: "Supplementary Genuine Set",
      path: "eval/real/genuine-items.json",
      expectedLabel: "genuine",
      resultFileName: "supp-genuine-results.json",
    },
    {
      name: "Supplementary Real Scams",
      path: "eval/real/items.json",
      expectedLabel: "scam",
      resultFileName: "supp-scams-results.json",
    },
  ];

  let liveCallsRemaining = maxCalls;

  for (const setInfo of setsToEvaluate) {
    console.log(`\n--- Evaluating: ${setInfo.name} (${setInfo.path}) ---`);
    if (!existsSync(setInfo.path)) {
      console.log(`[SKIPPED] File ${setInfo.path} is missing from workspace.`);
      continue;
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(readFileSync(setInfo.path, "utf-8"));
    } catch (e) {
      console.error(`[ERROR] Failed to parse JSON at ${setInfo.path}:`, e);
      continue;
    }

    if (!Array.isArray(rawData)) {
      console.error(`[ERROR] Expected array in ${setInfo.path}`);
      continue;
    }

    const items: SuppItem[] = rawData;
    console.log(`Loaded ${items.length} items from ${setInfo.path}. Validating...`);

    // Validation
    const errors: string[] = [];
    const duplicates: Array<{ id: string; duplicateOf: string; sim: number }> = [];

    items.forEach((item, idx) => {
      if (!item.id) errors.push(`Item at index ${idx} missing id`);
      if (item.label !== "scam" && item.label !== "genuine") {
        errors.push(`Item ${item.id} invalid label: ${item.label}`);
      }
      if (item.label === "genuine" && item.scam_type !== "none") {
        errors.push(`Item ${item.id} genuine but scam_type is '${item.scam_type}'`);
      }
      if (item.label === "scam" && (!item.scam_type || item.scam_type === "none")) {
        errors.push(`Item ${item.id} scam but scam_type is '${item.scam_type}'`);
      }
      if (!item.text || typeof item.text !== "string" || item.text.trim().length === 0) {
        errors.push(`Item ${item.id} has empty text`);
      } else if (item.text.length > 5000) {
        errors.push(`Item ${item.id} exceeds 5,000 characters (${item.text.length} chars)`);
      }

      // Check duplicates against dev/test
      if (item.text) {
        const grams = getWord3Grams(item.text);
        for (const ref of referenceItems) {
          const sim = jaccardSimilarity(grams, ref.grams);
          if (sim > 0.5) {
            duplicates.push({ id: item.id, duplicateOf: ref.id, sim });
          }
        }
      }
    });

    console.log(`Validation completed: ${errors.length} schema errors, ${duplicates.length} duplicate items found.`);
    if (errors.length > 0) {
      console.error(`Validation failed with ${errors.length} errors:`, errors.slice(0, 5));
      continue;
    }
    if (duplicates.length > 0) {
      console.warn(`Duplicates detected (word 3-gram Jaccard > 0.5):`);
      duplicates.forEach((d) => console.warn(`  - ID: ${d.id} duplicates ${d.duplicateOf} (Jaccard: ${d.sim.toFixed(3)})`));
    }

    // Evaluation
    const evaluated: Array<{
      id: string;
      label: "scam" | "genuine";
      scam_type: string;
      rulesTrust: number;
      rulesRisk: number;
      rulesBand: string;
      rulesFlags: string[];
      fullTrust: number;
      fullRisk: number;
      fullBand: string;
      aiSignals: Array<{ label: string; weight: number }>;
    }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const previewHits = runRules(item.text);
      const ruleLabels = previewHits.map((h) => h.label);

      let aiHits: RuleHit[] = [];

      if (isLive && liveCallsRemaining > 0) {
        const key = getCacheKey(GEMINI_MODEL, item.text);
        const cacheFile = resolve(CACHE_DIR, `${key}.json`);

        let cached: { aiHits?: RuleHit[] } | null = null;
        if (existsSync(cacheFile)) {
          cached = JSON.parse(readFileSync(cacheFile, "utf-8"));
        }

        if (!cached) {
          console.log(`[LIVE ${maxCalls - liveCallsRemaining + 1}/${maxCalls}] Gemini call for ${item.id}...`);
          try {
            const geminiRes = await analyzeWithGemini(item.text, ruleLabels);
            if (!geminiRes) {
              console.warn(`[WARN] Gemini returned null for ${item.id}`);
            } else {
              aiHits = geminiSignalsToHits(geminiRes.ai_signals);
              cached = { aiHits };
              // Cache saved in gitignored eval/cache_supp/
              writeFileSync(cacheFile, JSON.stringify(cached, null, 2) + "\n", "utf-8");
              liveCallsRemaining--;
            }
          } catch (err) {
            if (err instanceof GeminiServiceError && err.status === 429) {
              console.error(`[CRITICAL] HTTP 429 Quota Exhausted on ${item.id}. Stopping immediately without caching error.`);
              break;
            }
            throw err;
          }

          // Pacing 4 seconds
          if (liveCallsRemaining > 0 && i < items.length - 1) {
            await new Promise((r) => setTimeout(r, 4000));
          }
        } else {
          aiHits = cached.aiHits || [];
        }
      }

      const fullAnalysis = analyzeText(item.text, { aiHits, domainResults: [] });
      const rulesAnalysis = analyzeText(item.text, { aiHits: [], domainResults: [] });

      evaluated.push({
        id: item.id,
        label: item.label,
        scam_type: item.scam_type,
        rulesTrust: rulesAnalysis.trust,
        rulesRisk: rulesAnalysis.risk,
        rulesBand: rulesAnalysis.band,
        rulesFlags: rulesAnalysis.flags.map((f) => f.id),
        fullTrust: fullAnalysis.trust,
        fullRisk: fullAnalysis.risk,
        fullBand: fullAnalysis.band,
        aiSignals: aiHits.map((h) => ({ label: h.label, weight: h.weight })),
      });
    }

    // Aggregates & Metrics
    const scams = evaluated.filter((e) => e.label === "scam");
    const genuine = evaluated.filter((e) => e.label === "genuine");

    const rulesScam50 = scams.filter((s) => s.rulesTrust < 50).length;
    const rulesScam75 = scams.filter((s) => s.rulesTrust < 75).length;
    const fullScam50 = scams.filter((s) => s.fullTrust < 50).length;
    const fullScam75 = scams.filter((s) => s.fullTrust < 75).length;

    const rulesGen50 = genuine.filter((g) => g.rulesTrust < 50).length;
    const rulesGen75 = genuine.filter((g) => g.rulesTrust < 75).length;
    const fullGen50 = genuine.filter((g) => g.fullTrust < 50).length;
    const fullGen75 = genuine.filter((g) => g.fullTrust < 75).length;

    const metrics: Record<string, unknown> = {
      total: evaluated.length,
      scamsCount: scams.length,
      genuineCount: genuine.length,
    };

    if (scams.length > 0) {
      metrics.rulesRecall50 = { count: rulesScam50, fraction: `${rulesScam50}/${scams.length}`, ci: wilsonScoreInterval(rulesScam50, scams.length) };
      metrics.rulesRecall75 = { count: rulesScam75, fraction: `${rulesScam75}/${scams.length}`, ci: wilsonScoreInterval(rulesScam75, scams.length) };
      metrics.fullRecall50 = { count: fullScam50, fraction: `${fullScam50}/${scams.length}`, ci: wilsonScoreInterval(fullScam50, scams.length) };
      metrics.fullRecall75 = { count: fullScam75, fraction: `${fullScam75}/${scams.length}`, ci: wilsonScoreInterval(fullScam75, scams.length) };
    }

    if (genuine.length > 0) {
      metrics.rulesFp50 = { count: rulesGen50, fraction: `${rulesGen50}/${genuine.length}`, ci: wilsonScoreInterval(rulesGen50, genuine.length) };
      metrics.rulesFp75 = { count: rulesGen75, fraction: `${rulesGen75}/${genuine.length}`, ci: wilsonScoreInterval(rulesGen75, genuine.length) };
      metrics.fullFp50 = { count: fullGen50, fraction: `${fullGen50}/${genuine.length}`, ci: wilsonScoreInterval(fullGen50, genuine.length) };
      metrics.fullFp75 = { count: fullGen75, fraction: `${fullGen75}/${genuine.length}`, ci: wilsonScoreInterval(fullGen75, genuine.length) };
    }

    // AUC only if both classes have 10+ items
    if (scams.length >= 10 && genuine.length >= 10) {
      const rulesScores = evaluated.map((e) => ({ score: 100 - e.rulesTrust, isPositive: e.label === "scam" }));
      const fullScores = evaluated.map((e) => ({ score: 100 - e.fullTrust, isPositive: e.label === "scam" }));
      metrics.rulesRocAuc = bootstrapRocAuc(rulesScores, 1000, 42);
      metrics.fullRocAuc = bootstrapRocAuc(fullScores, 1000, 42);
    } else {
      metrics.rocAucNote = `AUC computed only when both classes have >= 10 items (scams: ${scams.length}, genuine: ${genuine.length})`;
    }

    // Transitions
    const fixed50 = scams.filter((s) => s.rulesTrust >= 50 && s.fullTrust < 50).map((s) => s.id);
    const broken50 = genuine.filter((g) => g.rulesTrust >= 50 && g.fullTrust < 50).map((g) => g.id);
    const fixed75 = scams.filter((s) => s.rulesTrust >= 75 && s.fullTrust < 75).map((s) => s.id);
    const broken75 = genuine.filter((g) => g.rulesTrust >= 75 && g.fullTrust < 75).map((g) => g.id);

    // Outliers: lowest Trust genuine, highest Trust scams
    const lowestTrustGenuine = [...genuine]
      .sort((a, b) => a.fullTrust - b.fullTrust)
      .slice(0, 5)
      .map((g) => ({ id: g.id, rulesTrust: g.rulesTrust, fullTrust: g.fullTrust, ruleIds: g.rulesFlags, aiSignalLabels: g.aiSignals.map((s) => s.label) }));
    const highestTrustScams = [...scams]
      .sort((a, b) => b.fullTrust - a.fullTrust)
      .slice(0, 5)
      .map((s) => ({ id: s.id, rulesTrust: s.rulesTrust, fullTrust: s.fullTrust, ruleIds: s.rulesFlags, aiSignalLabels: s.aiSignals.map((s) => s.label) }));

    const resultOutput = {
      setName: setInfo.name,
      evalDate: new Date().toISOString().split("T")[0],
      isLive,
      metrics,
      transitions: { fixed50, broken50, fixed75, broken75 },
      outliers: { lowestTrustGenuine, highestTrustScams },
      evaluated, // Per-item results contain ID, label, scores, flags, signals only (NO text, NO evidence strings)
    };

    const outPath = resolve(RESULTS_DIR, setInfo.resultFileName);
    writeFileSync(outPath, JSON.stringify(resultOutput, null, 2) + "\n", "utf-8");
    console.log(`Saved redacted results to ${outPath}`);
  }
}

if (process.argv[1]?.includes("run-supp")) {
  runSupp().catch((err) => {
    console.error("eval:supp encountered fatal error:", err);
    process.exit(1);
  });
}
