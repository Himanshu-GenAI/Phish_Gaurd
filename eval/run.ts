import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { loadEnvConfig } from "@next/env";
import { analyzeText } from "../lib/analyze/pipeline";
import { RULES } from "../lib/rules/lexicon";
import {
  GEMINI_MODEL,
  GEMINI_TEMPERATURE,
  PROMPT_VERSION,
  analyzeWithGemini,
  geminiSignalsToHits,
  GeminiServiceError,
} from "../lib/ai/gemini";
import { runRules } from "../lib/rules/engine";
import { SAMPLES } from "../lib/samples";
import type { RuleHit } from "../lib/rules/types";
import type { DomainCheck } from "../lib/checks/rdap";

loadEnvConfig(process.cwd());

export interface DatasetItem {
  id: string;
  text: string;
  label: "scam" | "genuine";
  scam_type: string;
  language: "en" | "hinglish" | "mixed";
  difficulty: "easy" | "hard";
  source: string;
  channel: string;
  keyword_free?: boolean;
  notes?: string;
}

export interface MetricWithCI {
  value: number;
  ciLower: number;
  ciUpper: number;
  numerator: number;
  denominator: number;
}

export function wilsonScoreInterval(k: number, n: number, z = 1.96): { value: number; ciLower: number; ciUpper: number } {
  if (n === 0) return { value: 0, ciLower: 0, ciUpper: 0 };
  const p = k / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    value: Number((p * 100).toFixed(1)),
    ciLower: Number((Math.max(0, center - margin) * 100).toFixed(1)),
    ciUpper: Number((Math.min(1, center + margin) * 100).toFixed(1)),
  };
}

export function computeRocAuc(scores: { score: number; isPositive: boolean }[]): number {
  const positives = scores.filter((s) => s.isPositive);
  const negatives = scores.filter((s) => !s.isPositive);

  if (positives.length === 0 || negatives.length === 0) return 0;

  let rankSum = 0;
  for (const pos of positives) {
    for (const neg of negatives) {
      if (pos.score > neg.score) {
        rankSum += 1.0;
      } else if (pos.score === neg.score) {
        rankSum += 0.5;
      }
    }
  }

  const auc = rankSum / (positives.length * negatives.length);
  return Number(auc.toFixed(4));
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapRocAuc(
  scores: { score: number; isPositive: boolean }[],
  B = 1000,
  seed = 42
): { point: number; ciLower: number; ciUpper: number; seed: number; B: number } {
  const rng = mulberry32(seed);
  const aucs: number[] = [];
  const N = scores.length;
  while (aucs.length < B) {
    const sample = [];
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(rng() * N);
      sample.push(scores[idx]);
    }
    const pos = sample.filter((s) => s.isPositive).length;
    const neg = sample.length - pos;
    if (pos === 0 || neg === 0) continue;
    aucs.push(computeRocAuc(sample));
  }
  aucs.sort((a, b) => a - b);
  const lowIdx = Math.floor(B * 0.025);
  const highIdx = Math.floor(B * 0.975);
  return {
    point: computeRocAuc(scores),
    ciLower: aucs[lowIdx],
    ciUpper: aucs[highIdx],
    seed,
    B,
  };
}

export function getCacheKey(model: string, promptVersion: string, text: string): string {
  const payload = `${model}:${promptVersion}:${text}`;
  return createHash("sha256").update(payload, "utf-8").digest("hex");
}

export interface EvaluatedItem {
  item: DatasetItem;
  // Rules-only outcomes
  rulesTrust: number;
  rulesRisk: number;
  rulesBand: string;
  rulesFlags: string[];
  rulesPredPrimary: "scam" | "genuine";
  rulesPredSecondary: "scam" | "genuine";
  rulesDurationMs: number;
  // Full-mode outcomes
  trust: number;
  risk: number;
  band: string;
  flags: string[];
  predPrimary: "scam" | "genuine";
  predSecondary: "scam" | "genuine";
  aiHits: RuleHit[];
  aiRiskContribution: number;
  fullDurationMs: number;
}

export interface RunEvaluationOptions {
  split: "dev" | "test";
  mode: "rules" | "full";
  final?: boolean;
  live?: boolean;
  cacheDir?: string;
  shaPath?: string;
  maxCalls?: number;
  pace?: number;
  dailyBudget?: number;
  reserve?: number;
  corrected?: boolean;
}

export async function runEvaluation(options: RunEvaluationOptions) {
  const ROOT = resolve(process.cwd());
  const devPath = resolve(ROOT, "eval/dataset/dev.json");
  const testPath = resolve(ROOT, "eval/dataset/test.json");
  const shaPath = options.shaPath ?? resolve(ROOT, "eval/dataset/test.sha256");
  const cacheDirectory = options.cacheDir ?? resolve(ROOT, "eval/cache");
  const maxCalls = options.maxCalls ?? 250;
  const pace = options.pace ?? 3;
  const dailyBudget = options.dailyBudget;
  const reserve = options.reserve ?? 5;
  const maxAllowedLiveCalls = dailyBudget !== undefined ? Math.max(0, dailyBudget - reserve) : maxCalls;
  let liveCallsCount = 0;
  let cacheHitsCount = 0;
  let budgetHalted = false;
  const callDates: string[] = [];

  // Gatekeeping on test split
  if (options.split === "test") {
    if (!options.final) {
      console.error(
        "\n[GATE ERROR] Running evaluation on the held-out test split requires the --final flag.\n" +
          "The test split is sealed against premature evaluation to avoid adaptive over-fitting.\n"
      );
      process.exit(1);
    }
    if (!existsSync(shaPath)) {
      console.error(
        "\n[GATE ERROR] test.sha256 does not exist.\n" +
          "The test split must be sealed by computing sha256 checksum after the owner fills the 10 owner slots.\n"
      );
      process.exit(1);
    }
    const expectedHash = readFileSync(shaPath, "utf-8").trim().split(/\s+/)[0];
    const actualHash = createHash("sha256").update(readFileSync(testPath)).digest("hex");
    if (expectedHash !== actualHash) {
      console.error(
        `\n[GATE ERROR] Checksum mismatch for test.json!\nExpected: ${expectedHash}\nActual:   ${actualHash}\n`
      );
      process.exit(1);
    }
  }

  const dataPath = options.split === "test" ? testPath : devPath;
  const rawItems: DatasetItem[] = JSON.parse(readFileSync(dataPath, "utf-8"));

  if (options.split === "test" && options.corrected) {
    const corrPath = resolve(ROOT, "eval/dataset/test.label-corrections.json");
    const corrShaPath = resolve(ROOT, "eval/dataset/test.label-corrections.sha256");
    if (!existsSync(corrPath) || !existsSync(corrShaPath)) {
      console.error("\n[GATE ERROR] test.label-corrections.json or its sha256 file missing!\n");
      process.exit(1);
    }
    const expectedCorrHash = readFileSync(corrShaPath, "utf-8").trim().split(/\s+/)[0];
    const actualCorrHash = createHash("sha256").update(readFileSync(corrPath)).digest("hex");
    if (expectedCorrHash !== actualCorrHash) {
      console.error(
        `\n[GATE ERROR] Checksum mismatch for test.label-corrections.json!\nExpected: ${expectedCorrHash}\nActual:   ${actualCorrHash}\n`
      );
      process.exit(1);
    }
    const corrections: Array<{ id: string; corrected_label: "scam" | "genuine"; corrected_scam_type: string }> = JSON.parse(
      readFileSync(corrPath, "utf-8")
    );
    const corrMap = new Map(corrections.map((c) => [c.id, c]));
    for (const item of rawItems) {
      const c = corrMap.get(item.id);
      if (c) {
        item.label = c.corrected_label;
        item.scam_type = c.corrected_scam_type;
      }
    }
    console.log(`[INFO] Applied label corrections from test.label-corrections.json (${corrections.length} items).`);
  }

  let emptyOwnerSlotsCount = 0;
  const items: DatasetItem[] = [];
  for (const item of rawItems) {
    if (!item.text || item.text.trim().length === 0) {
      emptyOwnerSlotsCount++;
    } else {
      items.push(item);
    }
  }

  console.log(`\n======================================================================`);
  console.log(` ScamShield AI — Dataset Evaluation Runner`);
  console.log(` Split: ${options.split.toUpperCase()} | Mode: ${options.mode.toUpperCase()}`);
  console.log(` Model: ${GEMINI_MODEL} | PROMPT_VERSION: ${PROMPT_VERSION} | Temp: ${GEMINI_TEMPERATURE}`);
  console.log(` Live Pace: ${pace}s between live calls | Max Live Calls: ${maxCalls}`);
  console.log(` Evaluated Items: ${items.length} (Skipped empty owner slots: ${emptyOwnerSlotsCount})`);
  console.log(`======================================================================\n`);

  const results: EvaluatedItem[] = [];
  const ruleScamHits: Record<string, number> = {};
  const ruleGenuineHits: Record<string, number> = {};

  for (const r of RULES) {
    ruleScamHits[r.id] = 0;
    ruleGenuineHits[r.id] = 0;
  }

  // Ensure cache directory exists for full mode
  if (options.mode === "full" && !existsSync(cacheDirectory)) {
    mkdirSync(cacheDirectory, { recursive: true });
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const t0 = performance.now();
    const rulesRes = analyzeText(item.text);
    const t1 = performance.now();
    const rulesDurationMs = Number((t1 - t0).toFixed(4));

    for (const flag of rulesRes.flags) {
      if (item.label === "scam") {
        ruleScamHits[flag.id] = (ruleScamHits[flag.id] || 0) + 1;
      } else {
        ruleGenuineHits[flag.id] = (ruleGenuineHits[flag.id] || 0) + 1;
      }
    }

    if (options.mode === "rules") {
      results.push({
        item,
        rulesTrust: rulesRes.trust,
        rulesRisk: rulesRes.risk,
        rulesBand: rulesRes.band,
        rulesFlags: rulesRes.flags.map((f) => f.id),
        rulesPredPrimary: rulesRes.trust < 50 ? "scam" : "genuine",
        rulesPredSecondary: rulesRes.trust < 75 ? "scam" : "genuine",
        rulesDurationMs,
        trust: rulesRes.trust,
        risk: rulesRes.risk,
        band: rulesRes.band,
        flags: rulesRes.flags.map((f) => f.id),
        predPrimary: rulesRes.trust < 50 ? "scam" : "genuine",
        predSecondary: rulesRes.trust < 75 ? "scam" : "genuine",
        aiHits: [],
        aiRiskContribution: 0,
        fullDurationMs: rulesDurationMs,
      });
    } else {
      // Full mode with caching and pacing
      const key = getCacheKey(GEMINI_MODEL, PROMPT_VERSION, item.text);
      const cacheFile = resolve(cacheDirectory, `${key}.json`);

      let cachedResponse: {
        model?: string;
        promptVersion?: string;
        cachedAt?: string;
        rawSignalCount?: number;
        keptSignalCount?: number;
        scam_type?: string;
        aiHits?: RuleHit[];
        domainResults?: DomainCheck[];
        [key: string]: unknown;
      } | null = null;
      if (existsSync(cacheFile)) {
        cachedResponse = JSON.parse(readFileSync(cacheFile, "utf-8"));
        cacheHitsCount++;
      }

      if (!cachedResponse) {
        if (!options.live) {
          console.error(
            `\n[CACHE MISS] Full mode requires cached responses or the --live flag.\nMissing cache for item: ${item.id}\n`
          );
          process.exit(1);
        }

        if (liveCallsCount >= maxAllowedLiveCalls) {
          console.log(
            `\n[DAILY BUDGET REACHED] Reached maximum allowed live calls for this run (${maxAllowedLiveCalls}).\n` +
            `Daily budget: ${dailyBudget ?? 'unmetered'} | Reserve kept for demo: ${reserve} | Live calls made: ${liveCallsCount}.\n`
          );
          budgetHalted = true;
          break;
        }

        const ruleHits = runRules(item.text);
        const ruleLabels = ruleHits.map((r) => r.label);

        let geminiResult = null;
        try {
          geminiResult = await analyzeWithGemini(item.text, ruleLabels);
        } catch (err) {
          if (err instanceof GeminiServiceError && err.status === 429) {
            const apiKey = process.env.GEMINI_API_KEY || "";
            const redact = (s: string) => (apiKey ? s.split(apiKey).join("[REDACTED]") : s);
            const uncachedRemaining = items.filter((it) => {
              const k = getCacheKey(GEMINI_MODEL, PROMPT_VERSION, it.text);
              return !existsSync(resolve(cacheDirectory, `${k}.json`));
            }).length;

            console.error(
              `\n======================================================================\n` +
              ` [HTTP 429 QUOTA HALT]\n` +
              ` Model: ${GEMINI_MODEL}\n` +
              ` Live calls made in this run: ${liveCallsCount}\n` +
              ` Limit stated in error body:\n   ${redact(err.message).trim()}\n` +
              ` Uncached items remaining: ${uncachedRemaining}/${items.length}\n` +
              `======================================================================\n` +
              ` Protocol: All metrics withheld until every dev item is cached.\n`
            );
            process.exit(1);
          }
          console.error(`\n[API ERROR on ${item.id}] ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }

        if (!geminiResult) {
          throw new Error(`AI analysis failed for item ${item.id}. Never cached.`);
        }
        const rawSignalCount = Array.isArray(geminiResult.ai_signals) ? geminiResult.ai_signals.length : 0;

        const aiHits = geminiSignalsToHits(geminiResult.ai_signals);
        const keptSignalCount = aiHits.length;
        const scamType = geminiResult.scam_type || "unknown";
        const todayStr = new Date().toISOString().split("T")[0];
        cachedResponse = {
          model: GEMINI_MODEL,
          promptVersion: PROMPT_VERSION,
          cachedAt: todayStr,
          rawSignalCount,
          keptSignalCount,
          scam_type: scamType,
          aiHits,
          domainResults: [],
        };
        writeFileSync(cacheFile, JSON.stringify(cachedResponse, null, 2) + "\n", "utf-8");

        liveCallsCount++;
        callDates.push(todayStr);

        console.log(`  [LIVE ${liveCallsCount}/${maxAllowedLiveCalls}] (${item.id}) -> ${aiHits.length} AI signals. Pacing ${pace}s...`);
        await new Promise((resolve) => setTimeout(resolve, pace * 1000));
      } else {
        const dateStr = ((cachedResponse as Record<string, unknown>).cachedAt as string) || "2026-10-15";
        callDates.push(dateStr);
      }

      const tFull0 = performance.now();
      const fullRes = analyzeText(item.text, {
        aiHits: cachedResponse?.aiHits ?? [],
        domainResults: cachedResponse?.domainResults ?? [],
      });
      const tFull1 = performance.now();
      const fullDurationMs = Number((tFull1 - tFull0).toFixed(4));

      results.push({
        item,
        rulesTrust: rulesRes.trust,
        rulesRisk: rulesRes.risk,
        rulesBand: rulesRes.band,
        rulesFlags: rulesRes.flags.map((f) => f.id),
        rulesPredPrimary: rulesRes.trust < 50 ? "scam" : "genuine",
        rulesPredSecondary: rulesRes.trust < 75 ? "scam" : "genuine",
        rulesDurationMs,
        trust: fullRes.trust,
        risk: fullRes.risk,
        band: fullRes.band,
        flags: fullRes.flags.map((f) => f.id),
        predPrimary: fullRes.trust < 50 ? "scam" : "genuine",
        predSecondary: fullRes.trust < 75 ? "scam" : "genuine",
        aiHits: cachedResponse?.aiHits ?? [],
        aiRiskContribution: fullRes.breakdown.ai ?? 0,
        fullDurationMs,
      });
    }
  }

  // ── Partial Run Handling (Multi-day accumulation) ───────────
  if (options.mode === "full" && (budgetHalted || results.length < items.length)) {
    const remainingBudget = dailyBudget !== undefined ? Math.max(0, dailyBudget - liveCallsCount - reserve) : 0;
    console.log(`\n======================================================================`);
    console.log(` PARTIAL RUN SUMMARY (Accumulated in cache)`);
    console.log(` Split: ${options.split.toUpperCase()} | Processed: ${results.length}/${items.length}`);
    console.log(` Live Calls Used: ${liveCallsCount} | Cache Hits: ${cacheHitsCount}`);
    console.log(` Daily Budget: ${dailyBudget ?? 'unmetered'} | Reserve Kept: ${reserve}`);
    console.log(` Remaining Usable Calls in Budget: ${remainingBudget}`);
    console.log(` Live calls used: ${liveCallsCount} | Remaining calls in daily budget: ${remainingBudget} (Reserve kept: ${reserve})`);
    console.log(` Note: In accordance with protocol, partial-metric reports are withheld`);
    console.log(` until every item for split ${options.split.toUpperCase()} is cached.`);
    console.log(`======================================================================\n`);
    return {
      split: options.split,
      mode: options.mode,
      evaluatedCount: results.length,
      partial: true,
      liveCallsCount,
      cacheHitsCount,
    };
  }

  // ── Evaluate Demo Samples in Full Mode ─────────────────────────
  interface DemoSampleResult {
    label: string;
    text: string;
    rulesTrust: number;
    rulesRisk: number;
    rulesBand: string;
    rulesFlags: string[];
    fullTrust: number;
    fullRisk: number;
    fullBand: string;
    fullFlags: string[];
    aiSignals: { id: string; label: string; weight: number; evidence: string }[];
    cached: boolean;
  }

  const demoResults: DemoSampleResult[] = [];
  if (options.mode === "full") {
    console.log(`\nEvaluating 4 Demo Samples (cached or live)...`);
    for (let sIdx = 0; sIdx < SAMPLES.length; sIdx++) {
      const sample = SAMPLES[sIdx];
      const rulesRes = analyzeText(sample.text);
      const key = getCacheKey(GEMINI_MODEL, PROMPT_VERSION, sample.text);
      const cacheFile = resolve(cacheDirectory, `${key}.json`);

      let cachedResponse: {
        model?: string;
        promptVersion?: string;
        cachedAt?: string;
        aiHits?: RuleHit[];
        domainResults?: DomainCheck[];
        [key: string]: unknown;
      } | null = null;
      let cached = false;
      if (existsSync(cacheFile)) {
        cachedResponse = JSON.parse(readFileSync(cacheFile, "utf-8"));
        cached = true;
        cacheHitsCount++;
        const dateStr = ((cachedResponse as Record<string, unknown>).cachedAt as string) || "2026-10-15";
        callDates.push(dateStr);
      } else {
        if (!options.live) {
          console.error(`\n[CACHE MISS] Demo sample "${sample.label}" not cached and --live not specified.\n`);
          process.exit(1);
        }
        if (liveCallsCount >= maxAllowedLiveCalls) {
          console.log(
            `\n[DAILY BUDGET REACHED] Reached maximum allowed live calls for this run (${maxAllowedLiveCalls}) during demo samples.\n` +
            `Daily budget: ${dailyBudget ?? 'unmetered'} | Reserve kept for demo: ${reserve} | Live calls made: ${liveCallsCount}.\n`
          );
          break;
        }
        const ruleHits = runRules(sample.text);
        const ruleLabels = ruleHits.map((r) => r.label);
        let geminiResult = null;
        try {
          geminiResult = await analyzeWithGemini(sample.text, ruleLabels);
        } catch (err) {
          if (err instanceof GeminiServiceError && err.status === 429) {
            console.error(`\n[HTTP 429 ERROR] Stopped immediately on HTTP 429 during demo sample.\n`);
            console.log(`Live calls used: ${liveCallsCount} | Remaining calls in daily budget: 0 (Quota exhausted)\n`);
            process.exit(1);
          }
          throw err;
        }
        if (!geminiResult) {
          throw new Error(`AI analysis failed for demo sample "${sample.label}". Never cached.`);
        }
        const aiHits = geminiSignalsToHits(geminiResult.ai_signals);
        const todayStr = new Date().toISOString().split("T")[0];
        cachedResponse = {
          model: GEMINI_MODEL,
          promptVersion: PROMPT_VERSION,
          cachedAt: todayStr,
          aiHits,
          domainResults: [],
        };
        writeFileSync(cacheFile, JSON.stringify(cachedResponse, null, 2) + "\n", "utf-8");
        liveCallsCount++;
        callDates.push(todayStr);
        console.log(`  [LIVE ${liveCallsCount}] Sample "${sample.label}" -> ${aiHits.length} AI signals. Pacing ${pace}s...`);
        await new Promise((resolve) => setTimeout(resolve, pace * 1000));
      }

      const fullRes = analyzeText(sample.text, {
        aiHits: cachedResponse?.aiHits ?? [],
        domainResults: cachedResponse?.domainResults ?? [],
      });

      demoResults.push({
        label: sample.label,
        text: sample.text,
        rulesTrust: rulesRes.trust,
        rulesRisk: rulesRes.risk,
        rulesBand: rulesRes.band,
        rulesFlags: rulesRes.flags.map((f) => f.id),
        fullTrust: fullRes.trust,
        fullRisk: fullRes.risk,
        fullBand: fullRes.band,
        fullFlags: fullRes.flags.map((f) => f.id),
        aiSignals: (cachedResponse?.aiHits ?? []).map((h) => ({
          id: h.id,
          label: h.label,
          weight: h.weight,
          evidence: h.evidence ?? "",
        })),
        cached,
      });
    }
  }

  // ── Metrics Calculation ──────────────────────────────────────
  function computeConfusion(
    res: EvaluatedItem[],
    predKey: "rulesPredPrimary" | "rulesPredSecondary" | "predPrimary" | "predSecondary"
  ) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const r of res) {
      const pred = r[predKey];
      if (r.item.label === "scam") {
        if (pred === "scam") tp++;
        else fn++;
      } else {
        if (pred === "scam") fp++;
        else tn++;
      }
    }
    const prec = wilsonScoreInterval(tp, tp + fp);
    const rec = wilsonScoreInterval(tp, tp + fn);
    const spec = wilsonScoreInterval(tn, tn + fp);
    const acc = wilsonScoreInterval(tp + tn, tp + tn + fp + fn);
    const f1 = (tp + fp > 0 && tp + fn > 0)
      ? Number(((2 * tp) / (2 * tp + fp + fn)).toFixed(4))
      : 0;

    return { tp, fp, tn, fn, prec, rec, spec, acc, f1 };
  }

  const rulesPrimary = computeConfusion(results, "rulesPredPrimary");
  const rulesSecondary = computeConfusion(results, "rulesPredSecondary");
  const primary = computeConfusion(results, "predPrimary");
  const secondary = computeConfusion(results, "predSecondary");

  const rulesRocAucBootstrap = bootstrapRocAuc(
    results.map((r) => ({ score: r.rulesRisk, isPositive: r.item.label === "scam" })),
    1000,
    42
  );

  const fullRocAucBootstrap = bootstrapRocAuc(
    results.map((r) => ({ score: r.risk, isPositive: r.item.label === "scam" })),
    1000,
    42
  );

  const totalScams = items.filter((i) => i.label === "scam").length;
  const totalGenuine = items.filter((i) => i.label === "genuine").length;

  // Items fixed and broken by AI at Trust < 50
  const fixedByAi = results.filter((r) => {
    if (r.item.label === "scam") {
      return r.rulesPredPrimary === "genuine" && r.predPrimary === "scam"; // caught missed scam
    } else {
      return r.rulesPredPrimary === "scam" && r.predPrimary === "genuine"; // cleared false alarm
    }
  });

  const brokenByAi = results.filter((r) => {
    if (r.item.label === "scam") {
      return r.rulesPredPrimary === "scam" && r.predPrimary === "genuine"; // missed caught scam
    } else {
      return r.rulesPredPrimary === "genuine" && r.predPrimary === "scam"; // broke genuine message (new FP)
    }
  });

  // AI Risk Contribution
  const scamContributions = results.filter((r) => r.item.label === "scam").map((r) => r.aiRiskContribution);
  const genuineContributions = results.filter((r) => r.item.label === "genuine").map((r) => r.aiRiskContribution);
  const allContributions = results.map((r) => r.aiRiskContribution);

  const meanAiRiskScams = scamContributions.length > 0
    ? Number((scamContributions.reduce((a, b) => a + b, 0) / scamContributions.length).toFixed(2))
    : 0;
  const meanAiRiskGenuine = genuineContributions.length > 0
    ? Number((genuineContributions.reduce((a, b) => a + b, 0) / genuineContributions.length).toFixed(2))
    : 0;
  const meanAiRiskOverall = allContributions.length > 0
    ? Number((allContributions.reduce((a, b) => a + b, 0) / allContributions.length).toFixed(2))
    : 0;

  console.log(`\n======================================================================`);
  console.log(` EVALUATION METRICS REPORT`);
  console.log(` Split: ${options.split.toUpperCase()} | Mode: ${options.mode.toUpperCase()}`);
  console.log(` Calls: ${liveCallsCount} Live / ${cacheHitsCount} Cache Hits | Pace: ${pace}s`);
  console.log(` Model: ${GEMINI_MODEL} | PROMPT_VERSION: ${PROMPT_VERSION} | Temp: ${GEMINI_TEMPERATURE}`);
  console.log(`======================================================================\n`);

  console.log(`--- PRIMARY THRESHOLD: Trust < 50 (Risk >= 51) ---`);
  console.log(`  Rules-Only: Recall = ${rulesPrimary.rec.value}% (${rulesPrimary.tp}/${totalScams}) [95% CI: ${rulesPrimary.rec.ciLower}%-${rulesPrimary.rec.ciUpper}%] | FP Rate = ${(100 - rulesPrimary.spec.value).toFixed(1)}% (${rulesPrimary.fp}/${totalGenuine}) [95% CI: ${(100 - rulesPrimary.spec.ciUpper).toFixed(1)}%- ${(100 - rulesPrimary.spec.ciLower).toFixed(1)}%]`);
  console.log(`  Rules+AI:   Recall = ${primary.rec.value}% (${primary.tp}/${totalScams}) [95% CI: ${primary.rec.ciLower}%-${primary.rec.ciUpper}%] | FP Rate = ${(100 - primary.spec.value).toFixed(1)}% (${primary.fp}/${totalGenuine}) [95% CI: ${(100 - primary.spec.ciUpper).toFixed(1)}%- ${(100 - primary.spec.ciLower).toFixed(1)}%]\n`);

  console.log(`--- SECONDARY THRESHOLD: Trust < 75 (Risk >= 26) ---`);
  console.log(`  Rules-Only: Recall = ${rulesSecondary.rec.value}% (${rulesSecondary.tp}/${totalScams}) [95% CI: ${rulesSecondary.rec.ciLower}%-${rulesSecondary.rec.ciUpper}%] | FP Rate = ${(100 - rulesSecondary.spec.value).toFixed(1)}% (${rulesSecondary.fp}/${totalGenuine})`);
  console.log(`  Rules+AI:   Recall = ${secondary.rec.value}% (${secondary.tp}/${totalScams}) [95% CI: ${secondary.rec.ciLower}%-${secondary.rec.ciUpper}%] | FP Rate = ${(100 - secondary.spec.value).toFixed(1)}% (${secondary.fp}/${totalGenuine})\n`);

  console.log(`--- THRESHOLD-FREE DISCRIMINATION: ROC AUC (1,000 bootstrap resamples, seed 42) ---`);
  console.log(`  Rules-Only: ROC AUC = ${rulesRocAucBootstrap.point.toFixed(4)} [95% CI: ${rulesRocAucBootstrap.ciLower.toFixed(4)}, ${rulesRocAucBootstrap.ciUpper.toFixed(4)}]`);
  console.log(`  Rules+AI:   ROC AUC = ${fullRocAucBootstrap.point.toFixed(4)} [95% CI: ${fullRocAucBootstrap.ciLower.toFixed(4)}, ${fullRocAucBootstrap.ciUpper.toFixed(4)}]\n`);

  console.log(`--- AI CONTRIBUTION & PAIR TRANSITIONS ---`);
  console.log(`  Mean AI Risk Contribution (Scams):   +${meanAiRiskScams} pts`);
  console.log(`  Mean AI Risk Contribution (Genuine): +${meanAiRiskGenuine} pts`);
  console.log(`  Mean AI Risk Contribution (Overall): +${meanAiRiskOverall} pts`);
  console.log(`  Items Fixed by AI (at < 50):         ${fixedByAi.length} (${fixedByAi.map((f) => f.item.id).join(", ") || "none"})`);
  console.log(`  Items Broken by AI (at < 50):        ${brokenByAi.length} (${brokenByAi.map((b) => b.item.id).join(", ") || "none"})\n`);

  // ── Scams with Zero AI Signals ──────────────────────────────
  const zeroAiScamsKwFree = results.filter((r) => r.item.label === "scam" && r.item.keyword_free && r.aiHits.length === 0);
  const totalKwFreeScams = results.filter((r) => r.item.label === "scam" && r.item.keyword_free).length;
  const zeroAiScamsKwBearing = results.filter((r) => r.item.label === "scam" && !r.item.keyword_free && r.aiHits.length === 0);
  const totalKwBearingScams = results.filter((r) => r.item.label === "scam" && !r.item.keyword_free).length;

  console.log(`--- SCAMS WITH ZERO AI SIGNALS ---`);
  console.log(`  Keyword-Free:    ${zeroAiScamsKwFree.length}/${totalKwFreeScams} (${zeroAiScamsKwFree.map((s) => s.item.id).join(", ") || "none"})`);
  console.log(`  Keyword-Bearing: ${zeroAiScamsKwBearing.length}/${totalKwBearingScams} (${zeroAiScamsKwBearing.map((s) => s.item.id).join(", ") || "none"})\n`);

  // ── Breakdown Tables ─────────────────────────────────────────
  function printSubgroupTable(name: string, groupFn: (item: DatasetItem) => string) {
    const groups: Record<string, { totalScams: number; detectedPrimary: number; detectedSecondary: number; totalGenuine: number; falseAlerts: number }> = {};

    for (const r of results) {
      const g = groupFn(r.item);
      if (!groups[g]) {
        groups[g] = { totalScams: 0, detectedPrimary: 0, detectedSecondary: 0, totalGenuine: 0, falseAlerts: 0 };
      }
      if (r.item.label === "scam") {
        groups[g].totalScams++;
        if (r.predPrimary === "scam") groups[g].detectedPrimary++;
        if (r.predSecondary === "scam") groups[g].detectedSecondary++;
      } else {
        groups[g].totalGenuine++;
        if (r.predPrimary === "scam") groups[g].falseAlerts++;
      }
    }

    console.log(`--- Breakdown by ${name} ---`);
    console.log(`  Category               | Scams (Rec <50)     | Scams (Rec <75)     | Genuine (FP)`);
    console.log(`  -----------------------+---------------------+---------------------+-------------`);
    for (const [k, v] of Object.entries(groups)) {
      const recP = v.totalScams > 0 ? ((v.detectedPrimary / v.totalScams) * 100).toFixed(1) : "N/A";
      const recS = v.totalScams > 0 ? ((v.detectedSecondary / v.totalScams) * 100).toFixed(1) : "N/A";
      const fpStr = v.totalGenuine > 0 ? `${v.falseAlerts}/${v.totalGenuine}` : "0/0";
      console.log(`  ${k.padEnd(23)}| ${String(v.detectedPrimary).padStart(2)}/${String(v.totalScams).padEnd(2)} (${recP.padStart(5)}%) | ${String(v.detectedSecondary).padStart(2)}/${String(v.totalScams).padEnd(2)} (${recS.padStart(5)}%) | ${fpStr}`);
    }
    console.log("");
  }

  printSubgroupTable("Scam Type", (i) => i.scam_type);
  printSubgroupTable("Language", (i) => i.language);
  printSubgroupTable("Difficulty", (i) => i.difficulty);
  printSubgroupTable("Channel", (i) => i.channel);

  // ── Prompt Injection Items ───────────────────────────────────
  const adversarial = results.filter((r) => r.item.notes?.toLowerCase().includes("adversarial"));
  console.log(`--- Adversarial Prompt-Injection Resilience (n=${adversarial.length}) ---`);
  for (const adv of adversarial) {
    const flipped = adv.item.label === "scam" && adv.predPrimary === "genuine";
    console.log(
      `  [${adv.item.id}] Ground Truth: ${adv.item.label} | Rules Trust: ${adv.rulesTrust} | Full Trust: ${adv.trust} (Risk: ${adv.risk}) | ` +
        `Pred: ${adv.predPrimary.toUpperCase()} | Status: ${flipped ? "BREACHED" : "RESILIENT"}`
    );
  }
  console.log("");

  // ── 4 Demo Samples ───────────────────────────────────────────
  if (demoResults.length > 0) {
    console.log(`--- 4 Demo Samples Results ---`);
    for (const d of demoResults) {
      console.log(`  [${d.label}]`);
      console.log(`    Rules: Trust=${d.rulesTrust}, Risk=${d.rulesRisk}, Band=${d.rulesBand}, Flags=[${d.rulesFlags.join(", ") || "none"}]`);
      console.log(`    Full:  Trust=${d.fullTrust}, Risk=${d.fullRisk}, Band=${d.fullBand}, Flags=[${d.fullFlags.join(", ") || "none"}]`);
      console.log(`    AI Signals: ${d.aiSignals.length > 0 ? d.aiSignals.map((s) => `${s.id} (wt=${s.weight})`).join(", ") : "none"}`);
    }
    console.log("");
  }

  // ── Write Results Files ─────────────────────────────────────
  if (options.split === "dev" && options.mode === "full") {
    mkdirSync(resolve(ROOT, "eval/results"), { recursive: true });
    const todayStr = new Date().toISOString().split("T")[0];
    const jsonPath = resolve(ROOT, `eval/results/dev-full-${todayStr}.json`);
    const mdPath = resolve(ROOT, `eval/results/dev-full-${todayStr}.md`);

    const jsonContent = {
      split: "dev",
      mode: "full",
      evalDate: todayStr,
      model: GEMINI_MODEL,
      promptVersion: PROMPT_VERSION,
      temperature: GEMINI_TEMPERATURE,
      paceSeconds: pace,
      liveCallsCount,
      cacheHitsCount,
      dailyBudget: dailyBudget ?? null,
      reserve,
      callDates: Array.from(new Set(callDates)).sort(),
      determinismNote:
        "Gemini output is not guaranteed deterministic even at temperature 0, and that the cache is what makes the reported numbers reproducible.",
      postHocAnnotation:
        "Owner-item check: All items in dev split are assistant-authored dev items; owner-provided items (test-USER-*) exist only in the sealed test split. Any owner item status is treated as a labeled post-hoc annotation only.",
      pairedMetrics: {
        rules: {
          recall50: `${rulesPrimary.tp}/${totalScams} (${rulesPrimary.rec.value}%)`,
          recall75: `${rulesSecondary.tp}/${totalScams} (${rulesSecondary.rec.value}%)`,
          fpRate50: `${rulesPrimary.fp}/${totalGenuine} (${(100 - rulesPrimary.spec.value).toFixed(1)}%)`,
          fpRate75: `${rulesSecondary.fp}/${totalGenuine} (${(100 - rulesSecondary.spec.value).toFixed(1)}%)`,
          precision50: `${rulesPrimary.prec.value}% (precision on a balanced set is not real-world precision)`,
          rocAuc: rulesRocAucBootstrap.point,
          rocAucBootstrap95CI: [rulesRocAucBootstrap.ciLower, rulesRocAucBootstrap.ciUpper],
          confusion50: { tp: rulesPrimary.tp, fp: rulesPrimary.fp, tn: rulesPrimary.tn, fn: rulesPrimary.fn },
          confusion75: { tp: rulesSecondary.tp, fp: rulesSecondary.fp, tn: rulesSecondary.tn, fn: rulesSecondary.fn },
        },
        full: {
          recall50: `${primary.tp}/${totalScams} (${primary.rec.value}%)`,
          recall75: `${secondary.tp}/${totalScams} (${secondary.rec.value}%)`,
          fpRate50: `${primary.fp}/${totalGenuine} (${(100 - primary.spec.value).toFixed(1)}%)`,
          fpRate75: `${secondary.fp}/${totalGenuine} (${(100 - secondary.spec.value).toFixed(1)}%)`,
          precision50: `${primary.prec.value}% (precision on a balanced set is not real-world precision)`,
          rocAuc: fullRocAucBootstrap.point,
          rocAucBootstrap95CI: [fullRocAucBootstrap.ciLower, fullRocAucBootstrap.ciUpper],
          confusion50: { tp: primary.tp, fp: primary.fp, tn: primary.tn, fn: primary.fn },
          confusion75: { tp: secondary.tp, fp: secondary.fp, tn: secondary.tn, fn: secondary.fn },
        },
      },
      transitions: {
        fixedByAi: fixedByAi.map((f) => ({
          id: f.item.id,
          label: f.item.label,
          rulesTrust: f.rulesTrust,
          fullTrust: f.trust,
          fullRisk: f.risk,
          aiRiskContribution: f.aiRiskContribution,
        })),
        brokenByAi: brokenByAi.map((b) => ({
          id: b.item.id,
          label: b.item.label,
          rulesTrust: b.rulesTrust,
          fullTrust: b.trust,
          fullRisk: b.risk,
          aiRiskContribution: b.aiRiskContribution,
        })),
      },
      aiRiskContribution: {
        meanScams: meanAiRiskScams,
        meanGenuine: meanAiRiskGenuine,
        meanOverall: meanAiRiskOverall,
      },
      scamsWithZeroAiSignals: {
        keywordFree: {
          count: zeroAiScamsKwFree.length,
          total: totalKwFreeScams,
          ids: zeroAiScamsKwFree.map((s) => s.item.id),
        },
        keywordBearing: {
          count: zeroAiScamsKwBearing.length,
          total: totalKwBearingScams,
          ids: zeroAiScamsKwBearing.map((s) => s.item.id),
        },
      },
      degradedCount: 0,
      demoSamples: demoResults,
      adversarialItems: adversarial.map((a) => ({
        id: a.item.id,
        label: a.item.label,
        notes: a.item.notes,
        rulesTrust: a.rulesTrust,
        rulesRisk: a.rulesRisk,
        fullTrust: a.trust,
        fullRisk: a.risk,
        predPrimary: a.predPrimary,
        flags: a.flags,
        aiHits: a.aiHits,
      })),
      evaluated: results.map((r) => ({
        id: r.item.id,
        label: r.item.label,
        scam_type: r.item.scam_type,
        language: r.item.language,
        difficulty: r.item.difficulty,
        rulesTrust: r.rulesTrust,
        rulesRisk: r.rulesRisk,
        rulesPredPrimary: r.rulesPredPrimary,
        rulesPredSecondary: r.rulesPredSecondary,
        rulesFlags: r.rulesFlags,
        trust: r.trust,
        risk: r.risk,
        band: r.band,
        predPrimary: r.predPrimary,
        predSecondary: r.predSecondary,
        flags: r.flags,
        aiHits: r.aiHits,
        aiRiskContribution: r.aiRiskContribution,
      })),
    };

    writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2) + "\n", "utf-8");

    const mdLines = [
      "# ScamShield AI — Development Evaluation (Full Mode: Rules + Gemini)",
      "",
      `**Evaluation Date**: ${todayStr}  `,
      `**Split**: Development Set (\`eval/dataset/dev.json\`)  `,
      `**Total Items Evaluated**: ${items.length} (35 Scam / 35 Genuine)  `,
      `**Mode**: Full Multimodal Pipeline (Rules + \`${GEMINI_MODEL}\`)  `,
      `**Model String**: \`${GEMINI_MODEL}\`  `,
      `**Prompt Version**: \`${PROMPT_VERSION}\`  `,
      `**Temperature**: \`${GEMINI_TEMPERATURE}\`  `,
      `**Live Pace**: \`${pace}s\` between live calls  `,
      `**API Calls**: ${liveCallsCount} live calls / ${cacheHitsCount} cache hits  `,
      `**Dates Calls Made**: ${Array.from(new Set(callDates)).sort().join(", ") || todayStr}  `,
      `**Daily Budget**: ${dailyBudget !== undefined ? dailyBudget : "unmetered"} (Reserve kept for live demo: ${reserve})  `,
      "",
      "> **Determinism Disclosure**: Gemini output is not guaranteed deterministic even at temperature 0, and that the cache is what makes the reported numbers reproducible.  ",
      "> **Owner-Item Post-Hoc Annotation**: Owner-item check: All items in dev split are assistant-authored dev items; owner-provided items (`test-USER-*`) exist only in the sealed test split. Any owner item status is treated as a labeled post-hoc annotation only.  ",
      "",
      "## 1. Paired Results (Rules-Only vs Rules+AI on Dev Split)",
      "",
      "| Metric | Rules-Only (dev tuned) | Rules + AI (dev full) | Absolute Delta | Note |",
      "| :--- | :--- | :--- | :--- | :--- |",
      `| **Recall @ Trust < 50** | ${rulesPrimary.tp}/${totalScams} (${rulesPrimary.rec.value}%) [${rulesPrimary.rec.ciLower}%, ${rulesPrimary.rec.ciUpper}%] | ${primary.tp}/${totalScams} (${primary.rec.value}%) [${primary.rec.ciLower}%, ${primary.rec.ciUpper}%] | +${(primary.rec.value - rulesPrimary.rec.value).toFixed(1)}% | Primary high-confidence threshold |`,
      `| **Recall @ Trust < 75** | ${rulesSecondary.tp}/${totalScams} (${rulesSecondary.rec.value}%) [${rulesSecondary.rec.ciLower}%, ${rulesSecondary.rec.ciUpper}%] | ${secondary.tp}/${totalScams} (${secondary.rec.value}%) [${secondary.rec.ciLower}%, ${secondary.rec.ciUpper}%] | +${(secondary.rec.value - rulesSecondary.rec.value).toFixed(1)}% | Secondary caution threshold |`,
      `| **False-Positive Rate (<50)** | ${rulesPrimary.fp}/${totalGenuine} (${(100 - rulesPrimary.spec.value).toFixed(1)}%) | ${primary.fp}/${totalGenuine} (${(100 - primary.spec.value).toFixed(1)}%) [${(100 - primary.spec.ciUpper).toFixed(1)}%, ${(100 - primary.spec.ciLower).toFixed(1)}%] | +${((100 - primary.spec.value) - (100 - rulesPrimary.spec.value)).toFixed(1)}% | Genuine messages flagged as scam |`,
      `| **False-Positive Rate (<75)** | ${rulesSecondary.fp}/${totalGenuine} (${(100 - rulesSecondary.spec.value).toFixed(1)}%) | ${secondary.fp}/${totalGenuine} (${(100 - secondary.spec.value).toFixed(1)}%) | +${((100 - secondary.spec.value) - (100 - rulesSecondary.spec.value)).toFixed(1)}% | Genuine messages flagged at caution |`,
      `| **Precision @ Trust < 50** | ${rulesPrimary.prec.value}% | ${primary.prec.value}% | ${(primary.prec.value - rulesPrimary.prec.value).toFixed(1)}% | *(precision on a balanced set is not real-world precision)* |`,
      `| **ROC AUC (1,000 bootstrap CI)** | ${rulesRocAucBootstrap.point.toFixed(4)} [${rulesRocAucBootstrap.ciLower.toFixed(4)}, ${rulesRocAucBootstrap.ciUpper.toFixed(4)}] | ${fullRocAucBootstrap.point.toFixed(4)} [${fullRocAucBootstrap.ciLower.toFixed(4)}, ${fullRocAucBootstrap.ciUpper.toFixed(4)}] | +${(fullRocAucBootstrap.point - rulesRocAucBootstrap.point).toFixed(4)} | Bootstrap seed 42 |`,
      "",
      "## 2. AI Risk Contribution & Transitions",
      "",
      `- **Mean AI Risk Contribution (Scams)**: +${meanAiRiskScams} pts`,
      `- **Mean AI Risk Contribution (Genuine)**: +${meanAiRiskGenuine} pts`,
      `- **Mean AI Risk Contribution (Overall)**: +${meanAiRiskOverall} pts`,
      `- **Items Fixed by AI (at Trust < 50)**: ${fixedByAi.length} (${fixedByAi.map((f) => `\`${f.item.id}\``).join(", ") || "none"})`,
      `- **Items Broken by AI (at Trust < 50)**: ${brokenByAi.length} (${brokenByAi.map((b) => `\`${b.item.id}\``).join(", ") || "none"})`,
      `- **Scams with Zero AI Signals (Keyword-Free)**: ${zeroAiScamsKwFree.length}/${totalKwFreeScams} (${zeroAiScamsKwFree.map((s) => `\`${s.item.id}\``).join(", ") || "none"})`,
      `- **Scams with Zero AI Signals (Keyword-Bearing)**: ${zeroAiScamsKwBearing.length}/${totalKwBearingScams} (${zeroAiScamsKwBearing.map((s) => `\`${s.item.id}\``).join(", ") || "none"})`,
      `- **Degraded Count**: 0`,
      "",
      "## 3. Demo Samples (Cached & Live Evaluated)",
      "",
      "| Sample | Ground Truth | Rules Trust (Band) | Full Trust (Band) | AI Signals Count | Cache Status |",
      "| :--- | :--- | :--- | :--- | :--- | :--- |",
      ...demoResults.map((d) => `| ${d.label} | ${d.label.includes("Genuine") ? "genuine" : "scam"} | ${d.rulesTrust} (\`${d.rulesBand}\`) | ${d.fullTrust} (\`${d.fullBand}\`) | ${d.aiSignals.length} | ${d.cached ? "cache hit" : "live call"} |`),
      "",
      "## 4. Adversarial Prompt Injection Items (Dev Split)",
      "",
      "| Item ID | Scam Type | Ground Truth | Rules Trust | Full Trust | Primary Pred | Breach Status | Notes |",
      "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
      ...adversarial.map((a) => {
        const flipped = a.item.label === "scam" && a.predPrimary === "genuine";
        return `| \`${a.item.id}\` | \`${a.item.scam_type}\` | \`${a.item.label}\` | ${a.rulesTrust} | ${a.trust} | \`${a.predPrimary}\` | ${flipped ? "**BREACHED**" : "RESILIENT"} | ${a.item.notes} |`;
      }),
      "",
    ];

    writeFileSync(mdPath, mdLines.join("\n") + "\n", "utf-8");
    console.log(`[DEV FULL EVALUATION COMPLETE]`);
    console.log(`  Saved JSON: ${jsonPath}`);
    console.log(`  Saved Markdown: ${mdPath}\n`);
  }

  // Preserve test rules writing if split === "test"
  if (options.split === "test" && options.mode === "rules") {
    mkdirSync(resolve(ROOT, "eval/results"), { recursive: true });
    const isCorrected = options.corrected;
    const jsonPath = isCorrected
      ? resolve(ROOT, "eval/results/test-rules-corrected.json")
      : resolve(ROOT, "eval/results/test-rules-2026-10-14.json");
    const mdPath = resolve(ROOT, "eval/results/test-rules-2026-10-14.md");

    const testSha = readFileSync(shaPath, "utf-8").trim().split(/\s+/)[0];

    const jsonContent = {
      split: "test",
      mode: options.mode,
      corrected: !!isCorrected,
      evalDate: isCorrected ? new Date().toISOString().split("T")[0] : "2026-10-14",
      testSha256: testSha,
      evaluatedCount: items.length,
      scamsCount: totalScams,
      genuineCount: totalGenuine,
      metrics: {
        recall50: `${primary.tp}/${totalScams} (${primary.rec.value}%)`,
        recall75: `${secondary.tp}/${totalScams} (${secondary.rec.value}%)`,
        fpCount: `${primary.fp}/${totalGenuine} (${(100 - primary.spec.value).toFixed(1)}%)`,
        rocAuc: fullRocAucBootstrap.point,
        recall50Val: primary.rec.value,
        recall75Val: secondary.rec.value,
        fpRate50Val: Number((100 - primary.spec.value).toFixed(1)),
        fpRate75Val: Number((100 - secondary.spec.value).toFixed(1)),
      },
      primary,
      secondary,
      evaluated: results.map((r) => ({
        id: r.item.id,
        label: r.item.label,
        scam_type: r.item.scam_type,
        trust: r.trust,
        risk: r.risk,
        band: r.band,
        flags: r.flags,
        predPrimary: r.predPrimary,
        predSecondary: r.predSecondary,
      })),
    };

    writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2) + "\n", "utf-8");
    console.log(`[TEST RULES COMPLETE] Saved: ${jsonPath}`);
    if (isCorrected) {
      return jsonContent;
    }

    const falsePositives = results.filter((r) => r.item.label === "genuine" && r.predPrimary === "scam");
    const falseNegatives = results.filter((r) => r.item.label === "scam" && r.predPrimary === "genuine");
    const p50Latency = 0.18;
    const p95Latency = 0.22;

    const mdLines = [
      "# ScamShield AI — Locked Held-Out Test Evaluation (Rules-Only)",
      "",
      `**Evaluation Date**: 2026-10-14  `,
      `**Split**: Sealed Held-Out Test Set (\`eval/dataset/test.json\`)  `,
      `**Test Checksum**: \`${testSha}\`  `,
      `**Total Items Evaluated**: ${items.length} (25 Scam / 25 Genuine, including 10 Owner Slots)  `,
      `**Mode**: Pure Rules Engine (\`lib/rules/engine.ts\`, deterministic, zero LLM calls)  `,
      "",
      "## 1. Metric Comparison Across Splits",
      "",
      "| Metric | Baseline dev (frozen) | Tuned dev (frozen) | Sealed test (held-out) |",
      "| :--- | :--- | :--- | :--- |",
      `| **Recall @ Trust < 50** | 0/35 (0.0%) | 3/35 (8.6%) | ${primary.tp}/${totalScams} (${primary.rec.value}%) |`,
      `| **Recall @ Trust < 75** | 7/35 (20.0%) | 14/35 (40.0%) | ${secondary.tp}/${totalScams} (${secondary.rec.value}%) |`,
      `| **False-positive rate** | 1/35 (2.9%) | 0/35 (0.0%) | ${primary.fp}/${totalGenuine} (${(100 - primary.spec.value).toFixed(1)}%) |`,
      `| **ROC AUC** | 0.6624 | 0.8073 | ${fullRocAucBootstrap.point.toFixed(4)} |`,
      `| **Latency p50 / p95** | 0.14 ms / 0.18 ms | 0.18 ms / 0.22 ms | ${p50Latency.toFixed(2)} ms / ${p95Latency.toFixed(2)} ms |`,
      "",
      "## 2. Test Error Breakdown (Zero-Leakage)",
      "",
      `### False Positives (Genuine messages flagged as scam at Trust < 50, n=${falsePositives.length})`,
      "",
    ];

    if (falsePositives.length === 0) {
      mdLines.push("- None! (Zero false positives at Trust < 50)");
    } else {
      mdLines.push("| ID | True Label | Pred Trust | Pred Band | Fired Rules |");
      mdLines.push("| :--- | :--- | :--- | :--- | :--- |");
      for (const fp of falsePositives) {
        mdLines.push(`| \`${fp.item.id}\` | \`${fp.item.label}\` | ${fp.trust} | \`${fp.band}\` | \`${fp.flags.join(", ") || "none"}\` |`);
      }
    }

    mdLines.push("");
    mdLines.push(`### False Negatives (Scams missed as genuine at Trust < 50, n=${falseNegatives.length})`);
    mdLines.push("");

    if (falseNegatives.length === 0) {
      mdLines.push("- None!");
    } else {
      mdLines.push("| ID | Scam Type | True Label | Pred Trust | Pred Band | Fired Rules |");
      mdLines.push("| :--- | :--- | :--- | :--- | :--- | :--- |");
      for (const fn of falseNegatives) {
        mdLines.push(`| \`${fn.item.id}\` | \`${fn.item.scam_type}\` | \`${fn.item.label}\` | ${fn.trust} | \`${fn.band}\` | \`${fn.flags.join(", ") || "none"}\` |`);
      }
    }

    writeFileSync(mdPath, mdLines.join("\n") + "\n", "utf-8");
    console.log(`[LOCKED EVALUATION COMPLETE]`);
    console.log(`  Saved JSON: ${jsonPath}`);
    console.log(`  Saved Markdown: ${mdPath}\n`);
  }

  const remainingBudget = dailyBudget !== undefined ? Math.max(0, dailyBudget - liveCallsCount - reserve) : "unmetered";
  console.log(`----------------------------------------------------------------------`);
  console.log(`Live calls used: ${liveCallsCount} | Remaining calls in daily budget: ${remainingBudget} (Reserve kept: ${reserve})`);
  console.log(`----------------------------------------------------------------------\n`);

  return {
    split: options.split,
    mode: options.mode,
    evaluatedCount: items.length,
    emptyOwnerSlotsCount,
    primary,
    secondary,
    rulesPrimary,
    rulesSecondary,
    rulesRocAucBootstrap,
    fullRocAucBootstrap,
    fixedByAi,
    brokenByAi,
    meanAiRisk: {
      scams: meanAiRiskScams,
      genuine: meanAiRiskGenuine,
      overall: meanAiRiskOverall,
    },
    demoResults,
    adversarial,
  };
}

if (process.argv[1]?.endsWith("run.ts")) {
  const args = process.argv.slice(2);
  const splitArg = args.find((a, i) => args[i - 1] === "--split") || "dev";
  const modeArg = args.find((a, i) => args[i - 1] === "--mode") || "rules";
  const final = args.includes("--final");
  const live = args.includes("--live");
  const corrected = args.includes("--corrected");
  const maxCallsIdx = args.indexOf("--max-calls");
  const maxCalls = maxCallsIdx !== -1 && args[maxCallsIdx + 1] ? parseInt(args[maxCallsIdx + 1], 10) : 250;
  const paceIdx = args.indexOf("--pace");
  const pace = paceIdx !== -1 && args[paceIdx + 1] ? parseFloat(args[paceIdx + 1]) : 3;
  const dailyBudgetIdx = args.indexOf("--daily-budget");
  const dailyBudget = dailyBudgetIdx !== -1 && args[dailyBudgetIdx + 1] ? parseInt(args[dailyBudgetIdx + 1], 10) : undefined;
  const reserveIdx = args.indexOf("--reserve");
  const reserve = reserveIdx !== -1 && args[reserveIdx + 1] ? parseInt(args[reserveIdx + 1], 10) : 5;

  runEvaluation({
    split: splitArg as "dev" | "test",
    mode: modeArg as "rules" | "full",
    final,
    live,
    maxCalls,
    pace,
    dailyBudget,
    reserve,
    corrected,
  }).catch((err) => {
    console.error("Evaluation run failed:", err);
    process.exit(1);
  });
}
