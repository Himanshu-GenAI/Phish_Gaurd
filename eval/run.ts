import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { analyzeText } from "../lib/analyze/pipeline";
import { RULES } from "../lib/rules/lexicon";
import { PROMPT_VERSION } from "../lib/ai/gemini";
import type { RuleHit } from "../lib/rules/types";
import type { DomainCheck } from "../lib/checks/rdap";

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

export function getCacheKey(model: string, promptVersion: string, text: string): string {
  const payload = `${model}:${promptVersion}:${text}`;
  return createHash("sha256").update(payload, "utf-8").digest("hex");
}

export async function runEvaluation(options: {
  split: "dev" | "test";
  mode: "rules" | "full";
  final?: boolean;
  live?: boolean;
  cacheDir?: string;
  shaPath?: string;
}) {
  const ROOT = resolve(process.cwd());
  const devPath = resolve(ROOT, "eval/dataset/dev.json");
  const testPath = resolve(ROOT, "eval/dataset/test.json");
  const shaPath = options.shaPath ?? resolve(ROOT, "eval/dataset/test.sha256");
  const cacheDirectory = options.cacheDir ?? resolve(ROOT, "eval/cache");

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
  console.log(` Split: ${options.split.toUpperCase()} | Mode: ${options.mode.toUpperCase()} | PROMPT_VERSION: ${PROMPT_VERSION}`);
  console.log(` Evaluated Items: ${items.length} (Skipped empty owner slots: ${emptyOwnerSlotsCount})`);
  console.log(`======================================================================\n`);

  interface EvaluatedItem {
    item: DatasetItem;
    risk: number;
    trust: number;
    flags: string[];
    predPrimary: "scam" | "genuine"; // Trust < 50
    predSecondary: "scam" | "genuine"; // Trust < 75
  }

  const results: EvaluatedItem[] = [];
  const ruleScamHits: Record<string, number> = {};
  const ruleGenuineHits: Record<string, number> = {};

  for (const r of RULES) {
    ruleScamHits[r.id] = 0;
    ruleGenuineHits[r.id] = 0;
  }

  for (const item of items) {
    if (options.mode === "rules") {
      const res = analyzeText(item.text);
      const isScamPredPrimary = res.trust < 50 ? "scam" : "genuine";
      const isScamPredSecondary = res.trust < 75 ? "scam" : "genuine";

      for (const flag of res.flags) {
        if (item.label === "scam") {
          ruleScamHits[flag.id] = (ruleScamHits[flag.id] || 0) + 1;
        } else {
          ruleGenuineHits[flag.id] = (ruleGenuineHits[flag.id] || 0) + 1;
        }
      }

      results.push({
        item,
        risk: res.risk,
        trust: res.trust,
        flags: res.flags.map((f) => f.id),
        predPrimary: isScamPredPrimary,
        predSecondary: isScamPredSecondary,
      });
    } else {
      // Full mode with caching
      if (!existsSync(cacheDirectory)) {
        mkdirSync(cacheDirectory, { recursive: true });
      }
      const model = "gemini-2.5-flash";
      const key = getCacheKey(model, PROMPT_VERSION, item.text);
      const cacheFile = resolve(cacheDirectory, `${key}.json`);

      let cachedResponse: { aiHits?: RuleHit[]; domainResults?: DomainCheck[] } | null = null;
      if (existsSync(cacheFile)) {
        cachedResponse = JSON.parse(readFileSync(cacheFile, "utf-8"));
      }

      if (!cachedResponse) {
        if (!options.live) {
          console.error(
            `\n[CACHE MISS] Full mode requires cached responses or the --live flag.\nMissing cache for item: ${item.id}\n`
          );
          process.exit(1);
        }
        // Live calls are explicitly prohibited in Phase 4 baseline
        console.error("[LIVE BLOCKED] Live API calls are disabled during baseline run.");
        process.exit(1);
      }

      // Process cached response
      const res = analyzeText(item.text, {
        aiHits: cachedResponse.aiHits ?? [],
        domainResults: cachedResponse.domainResults ?? [],
      });

      results.push({
        item,
        risk: res.risk,
        trust: res.trust,
        flags: res.flags.map((f) => f.id),
        predPrimary: res.trust < 50 ? "scam" : "genuine",
        predSecondary: res.trust < 75 ? "scam" : "genuine",
      });
    }
  }

  // ── Metrics Calculation ──────────────────────────────────────
  function computeConfusion(res: EvaluatedItem[], predKey: "predPrimary" | "predSecondary") {
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

  const primary = computeConfusion(results, "predPrimary");
  const secondary = computeConfusion(results, "predSecondary");

  // ROC AUC
  const rocAuc = computeRocAuc(
    results.map((r) => ({
      score: r.risk,
      isPositive: r.item.label === "scam",
    }))
  );

  console.log(`--- PRIMARY DECISION THRESHOLD: Trust < 50 (Risk >= 51) ---`);
  console.log(`  Confusion Matrix: TP=${primary.tp}, FP=${primary.fp}, TN=${primary.tn}, FN=${primary.fn}`);
  console.log(`  Precision:        ${primary.prec.value}% (95% CI: [${primary.prec.ciLower}%, ${primary.prec.ciUpper}%])`);
  console.log(`  Recall:           ${primary.rec.value}% (95% CI: [${primary.rec.ciLower}%, ${primary.rec.ciUpper}%])`);
  console.log(`  Specificity:      ${primary.spec.value}% (95% CI: [${primary.spec.ciLower}%, ${primary.spec.ciUpper}%])`);
  console.log(`  Accuracy:         ${primary.acc.value}% (95% CI: [${primary.acc.ciLower}%, ${primary.acc.ciUpper}%])`);
  console.log(`  F1-Score:         ${(primary.f1 * 100).toFixed(1)}%\n`);

  console.log(`--- SECONDARY DECISION THRESHOLD: Trust < 75 (Risk >= 26) ---`);
  console.log(`  Confusion Matrix: TP=${secondary.tp}, FP=${secondary.fp}, TN=${secondary.tn}, FN=${secondary.fn}`);
  console.log(`  Precision:        ${secondary.prec.value}% (95% CI: [${secondary.prec.ciLower}%, ${secondary.prec.ciUpper}%])`);
  console.log(`  Recall:           ${secondary.rec.value}% (95% CI: [${secondary.rec.ciLower}%, ${secondary.rec.ciUpper}%])`);
  console.log(`  Accuracy:         ${secondary.acc.value}% (95% CI: [${secondary.acc.ciLower}%, ${secondary.acc.ciUpper}%])`);
  console.log(`  F1-Score:         ${(secondary.f1 * 100).toFixed(1)}%\n`);

  console.log(`--- THRESHOLD-FREE DISCRIMINATION ---`);
  console.log(`  ROC AUC (Risk Score): ${rocAuc}\n`);

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
  printSubgroupTable("Keyword-Free (Scams)", (i) => i.label === "scam" ? (i.keyword_free ? "keyword_free: true" : "keyword_free: false") : "genuine");

  // ── Prompt Injection Items ───────────────────────────────────
  const adversarial = results.filter((r) => r.item.notes?.toLowerCase().includes("adversarial"));
  console.log(`--- Adversarial Prompt-Injection Resilience (n=${adversarial.length}) ---`);
  if (options.mode === "rules") {
    console.log("  N/A (rules do not read instructions)\n");
  } else {
    for (const adv of adversarial) {
      const flipped = adv.item.label === "scam" && adv.predPrimary === "genuine";
      console.log(
        `  [${adv.item.id}] Ground Truth: ${adv.item.label} | Risk: ${adv.risk} | Trust: ${adv.trust} | ` +
          `Pred: ${adv.predPrimary.toUpperCase()} | Flipped: ${flipped ? "YES (BREACHED)" : "NO (RESILIENT)"}`
      );
    }
    console.log("");
  }

  // ── Rule Engine Diagnostics ──────────────────────────────────
  console.log(`--- Per-Rule Diagnostic Frequencies (18 Rules) ---`);
  console.log(`  Rule ID              | Weight | Scam Hits | Genuine Hits | Net Selectivity`);
  console.log(`  ---------------------+--------+-----------+--------------+----------------`);
  const neverFiring: string[] = [];
  for (const rule of RULES) {
    const sHits = ruleScamHits[rule.id] || 0;
    const gHits = ruleGenuineHits[rule.id] || 0;
    const totalHits = sHits + gHits;
    if (totalHits === 0) neverFiring.push(rule.id);
    const selectivity = totalHits > 0 ? `${((sHits / totalHits) * 100).toFixed(1)}%` : "N/A";
    console.log(
      `  ${rule.id.padEnd(21)}| ${String(rule.weight).padStart(6)} | ${String(sHits).padStart(9)} | ${String(gHits).padStart(12)} | ${selectivity}`
    );
  }
  console.log(`\n  Never-firing rules in this split (${neverFiring.length}): ${neverFiring.join(", ") || "none"}\n`);

  // ── Error Analysis (False Positives & False Negatives) ───────
  const falsePositives = results.filter((r) => r.item.label === "genuine" && r.predPrimary === "scam");
  const falseNegatives = results.filter((r) => r.item.label === "scam" && r.predPrimary === "genuine");

  console.log(`--- Error Analysis: False Positives (Genuine messages flagged as scam, n=${falsePositives.length}) ---`);
  if (falsePositives.length === 0) {
    console.log("  None! (Zero False Positives at Trust < 50)");
  } else {
    for (const fp of falsePositives) {
      console.log(`\n  [${fp.item.id}] Trust: ${fp.trust} (Risk: ${fp.risk}) | Flags: [${fp.flags.join(", ")}]`);
      console.log(`  Text: "${fp.item.text}"`);
    }
  }

  console.log(`\n--- Error Analysis: False Negatives (Scams missed as genuine, n=${falseNegatives.length}) ---`);
  for (const fn of falseNegatives) {
    console.log(`\n  [${fn.item.id}] Type: ${fn.item.scam_type} | Trust: ${fn.trust} (Risk: ${fn.risk}) | Flags: [${fn.flags.join(", ") || "none"}]`);
    console.log(`  Text: "${fn.item.text}"`);
  }
  console.log("\n======================================================================\n");

  return {
    split: options.split,
    mode: options.mode,
    evaluatedCount: items.length,
    emptyOwnerSlotsCount,
    primary,
    secondary,
    rocAuc,
    falsePositives,
    falseNegatives,
    adversarial,
  };
}

if (process.argv[1]?.endsWith("run.ts")) {
  const args = process.argv.slice(2);
  const splitArg = args.find((a, i) => args[i - 1] === "--split") || "dev";
  const modeArg = args.find((a, i) => args[i - 1] === "--mode") || "rules";
  const final = args.includes("--final");
  const live = args.includes("--live");

  runEvaluation({
    split: splitArg as "dev" | "test",
    mode: modeArg as "rules" | "full",
    final,
    live,
  }).catch((err) => {
    console.error("Evaluation run failed:", err);
    process.exit(1);
  });
}
