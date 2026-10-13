import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface DatasetItem {
  id: string;
  text: string;
  label: "scam" | "genuine";
  scam_type:
    | "digital_arrest"
    | "fake_job"
    | "task_prepayment"
    | "investment"
    | "kyc_utility_courier"
    | "upi_collect"
    | "loan_app"
    | "voice_clone_emergency"
    | "fake_customer_care"
    | "phishing_apk"
    | "none";
  language: "en" | "hinglish" | "mixed";
  difficulty: "easy" | "hard";
  source: "synthetic" | "real_redacted";
  channel: "sms" | "whatsapp" | "email" | "call_transcript";
  notes?: string;
}

const ROOT = resolve(import.meta.dirname, "..");
const DEV_PATH = resolve(ROOT, "eval/dataset/dev.json");
const TEST_PATH = resolve(ROOT, "eval/dataset/test.json");

const ALLOWED_LABELS = new Set(["scam", "genuine"]);
const ALLOWED_SCAM_TYPES = new Set([
  "digital_arrest",
  "fake_job",
  "task_prepayment",
  "investment",
  "kyc_utility_courier",
  "upi_collect",
  "loan_app",
  "voice_clone_emergency",
  "fake_customer_care",
  "phishing_apk",
  "none",
]);
const ALLOWED_LANGUAGES = new Set(["en", "hinglish", "mixed"]);
const ALLOWED_DIFFICULTIES = new Set(["easy", "hard"]);
const ALLOWED_SOURCES = new Set(["synthetic", "real_redacted"]);
const ALLOWED_CHANNELS = new Set(["sms", "whatsapp", "email", "call_transcript"]);

function getWordShingles(text: string, k = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length < k) {
    return new Set(words);
  }

  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(" "));
  }
  return shingles;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function validateDataset(): {
  success: boolean;
  errors: string[];
  warnings: string[];
  topSimilar: Array<{ id1: string; id2: string; sim: number }>;
  stats: Record<string, unknown>;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(DEV_PATH)) {
    errors.push(`dev.json not found at ${DEV_PATH}`);
  }
  if (!existsSync(TEST_PATH)) {
    errors.push(`test.json not found at ${TEST_PATH}`);
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings, topSimilar: [], stats: {} };
  }

  const dev: DatasetItem[] = JSON.parse(readFileSync(DEV_PATH, "utf-8"));
  const test: DatasetItem[] = JSON.parse(readFileSync(TEST_PATH, "utf-8"));

  const allItems = [...dev, ...test];
  const seenIds = new Set<string>();

  // Validate item schemas
  for (const item of allItems) {
    if (!item.id || typeof item.id !== "string") {
      errors.push(`Item missing string ID: ${JSON.stringify(item)}`);
      continue;
    }
    if (seenIds.has(item.id)) {
      errors.push(`Duplicate ID found: ${item.id}`);
    }
    seenIds.add(item.id);

    if (!ALLOWED_LABELS.has(item.label)) {
      errors.push(`[${item.id}] Invalid label: ${item.label}`);
    }
    if (!ALLOWED_SCAM_TYPES.has(item.scam_type)) {
      errors.push(`[${item.id}] Invalid scam_type: ${item.scam_type}`);
    }
    if (item.label === "genuine" && item.scam_type !== "none") {
      errors.push(`[${item.id}] Genuine item must have scam_type 'none', got '${item.scam_type}'`);
    }
    if (!ALLOWED_LANGUAGES.has(item.language)) {
      errors.push(`[${item.id}] Invalid language: ${item.language}`);
    }
    if (!ALLOWED_DIFFICULTIES.has(item.difficulty)) {
      errors.push(`[${item.id}] Invalid difficulty: ${item.difficulty}`);
    }
    if (!ALLOWED_SOURCES.has(item.source)) {
      errors.push(`[${item.id}] Invalid source: ${item.source}`);
    }
    if (!ALLOWED_CHANNELS.has(item.channel)) {
      errors.push(`[${item.id}] Invalid channel: ${item.channel}`);
    }

    if (item.id.startsWith("test-USER-")) {
      if (item.label !== "genuine") {
        warnings.push(`[${item.id}] Owner slot expected to be genuine, but found '${item.label}'`);
      }
      if (item.text.trim().length === 0) {
        warnings.push(`[${item.id}] Reserved owner slot is currently empty (expected until filled by project owner).`);
      }
    } else if (item.text.trim().length === 0) {
      errors.push(`[${item.id}] Non-owner item has empty text`);
    }
  }

  // Stricter word 3-gram duplicate check
  const populated = allItems.filter((i) => i.text.trim().length > 0);
  const shinglesMap = new Map<string, Set<string>>();
  for (const item of populated) {
    shinglesMap.set(item.id, getWordShingles(item.text, 3));
  }

  const allPairs: Array<{ id1: string; id2: string; sim: number }> = [];

  for (let i = 0; i < populated.length; i++) {
    for (let j = i + 1; j < populated.length; j++) {
      const a = populated[i];
      const b = populated[j];
      const sim = jaccardSimilarity(shinglesMap.get(a.id)!, shinglesMap.get(b.id)!);
      if (sim > 0.05) {
        allPairs.push({ id1: a.id, id2: b.id, sim: Number(sim.toFixed(3)) });
      }
      if (sim > 0.5) {
        warnings.push(`Review pair: 3-gram similarity ${(sim * 100).toFixed(1)}% between ${a.id} and ${b.id}`);
      }
      if (sim > 0.8) {
        errors.push(`Near-duplicate detected (${(sim * 100).toFixed(1)}% match): ${a.id} <-> ${b.id}`);
      }
    }
  }

  allPairs.sort((a, b) => b.sim - a.sim);
  const topSimilar = allPairs.slice(0, 10);

  // Aggregate stats
  const countBy = (items: DatasetItem[], key: keyof DatasetItem) => {
    const acc: Record<string, number> = {};
    for (const item of items) {
      const v = String(item[key]);
      acc[v] = (acc[v] || 0) + 1;
    }
    return acc;
  };

  const testPopulated = test.filter((i) => i.text.trim().length > 0);
  const testOwner = test.filter((i) => i.id.startsWith("test-USER-"));

  const scamItems = populated.filter((i) => i.label === "scam");
  const devScamItems = dev.filter((i) => i.label === "scam");
  const devKeywordFree = devScamItems.filter((i) => (i as unknown as { keyword_free?: boolean }).keyword_free === true);
  const totalKeywordFree = scamItems.filter((i) => (i as unknown as { keyword_free?: boolean }).keyword_free === true);

  const genuineItems = populated.filter((i) => i.label === "genuine");
  const devHardNegatives = dev.filter((i) => i.label === "genuine" && i.difficulty === "hard");
  const testHardNegatives = testPopulated.filter((i) => i.label === "genuine" && i.difficulty === "hard");
  const totalHardNegatives = genuineItems.filter((i) => i.difficulty === "hard");

  const nearLimitItems = populated
    .filter((i) => i.text.length >= 1000)
    .map((i) => ({ id: i.id, length: i.text.length }))
    .sort((a, b) => b.length - a.length);

  const stats = {
    totalItems: allItems.length,
    devCount: dev.length,
    testTotalCount: test.length,
    testPopulatedCount: testPopulated.length,
    testOwnerSlots: testOwner.length,
    targetsVsActuals: {
      splitTotal: { dev: `${dev.length} (target: 70)`, test: `${test.length} (target: 50 [40 + 10 owner slots])` },
      labelBalance: {
        dev: { scam: dev.filter(i => i.label === "scam").length, genuine: dev.filter(i => i.label === "genuine").length, target: "35 / 35" },
        testPopulated: { scam: testPopulated.filter(i => i.label === "scam").length, genuine: testPopulated.filter(i => i.label === "genuine").length, target: "25 / 15 (+10 owner = 25/25)" },
        overall: { scam: scamItems.length, genuine: genuineItems.length + testOwner.length, target: "60 / 60" }
      },
      languageDev: {
        en: `${dev.filter(i => i.language === "en").length} (target: 28 [40%])`,
        hinglish: `${dev.filter(i => i.language === "hinglish").length} (target: 23 [33%])`,
        mixed: `${dev.filter(i => i.language === "mixed").length} (target: 19 [27%])`,
      },
      keywordFreeScams: {
        devCount: `${devKeywordFree.length} / ${devScamItems.length} (${((devKeywordFree.length / devScamItems.length) * 100).toFixed(1)}%)`,
        devTarget: ">= 45.0% (>= 16 items)"
      },
      hardNegatives: {
        devCount: devHardNegatives.length,
        testPopulatedCount: testHardNegatives.length,
        totalAcrossSplits: `${totalHardNegatives.length} (target: >= 28)`
      },
      nearLimitLengthsDev: nearLimitItems.filter(i => i.id.startsWith("dev-") && i.length >= 4000)
    },
    byLabel: {
      dev: countBy(dev, "label"),
      testPopulated: countBy(testPopulated, "label"),
      totalPopulated: countBy(populated, "label"),
    },
    byScamType: {
      dev: countBy(dev.filter((i) => i.label === "scam"), "scam_type"),
      testPopulated: countBy(testPopulated.filter((i) => i.label === "scam"), "scam_type"),
    },
    byLanguage: {
      dev: countBy(dev, "language"),
      testPopulated: countBy(testPopulated, "language"),
      totalPopulated: countBy(populated, "language"),
    },
    byDifficulty: {
      dev: countBy(dev, "difficulty"),
      testPopulated: countBy(testPopulated, "difficulty"),
      totalPopulated: countBy(populated, "difficulty"),
    },
    byChannel: {
      dev: countBy(dev, "channel"),
      testPopulated: countBy(testPopulated, "channel"),
      totalPopulated: countBy(populated, "channel"),
    },
    keywordFreeScams: {
      devCount: devKeywordFree.length,
      devTotalScams: devScamItems.length,
      devPercentage: Number(((devKeywordFree.length / Math.max(1, devScamItems.length)) * 100).toFixed(1)),
      totalPopulatedCount: totalKeywordFree.length,
      totalScams: scamItems.length,
    },
    hardNegatives: {
      devCount: devHardNegatives.length,
      testCount: testHardNegatives.length,
      totalCount: totalHardNegatives.length,
      totalGenuine: genuineItems.length,
    },
    nearLimitLengths: nearLimitItems,
    adversarialCount: populated.filter((i) => i.notes?.toLowerCase().includes("adversarial")).length,
    urlCount: populated.filter((i) => i.text.includes("http://") || i.text.includes("https://")).length,
    upiCount: populated.filter((i) => /@[\w.-]+/.test(i.text)).length,
  };

  return {
    success: errors.length === 0,
    errors,
    warnings,
    topSimilar,
    stats,
  };
}

if (process.argv[1]?.endsWith("check-dataset.ts")) {
  console.log("Validating ScamShield dataset...");
  const res = validateDataset();

  console.log("\nTop 10 Similar Pairs (IDs & 3-gram Jaccard score only):");
  for (const pair of res.topSimilar) {
    console.log(`  ${pair.id1} <-> ${pair.id2}: ${(pair.sim * 100).toFixed(1)}%`);
  }

  if (res.warnings.length > 0) {
    console.log(`\nWarnings (${res.warnings.length}):`);
    for (const w of res.warnings) console.log(`  - ${w}`);
  }

  if (res.errors.length > 0) {
    console.error(`\nValidation Errors (${res.errors.length}):`);
    for (const e of res.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log("\nDATASET VALIDATION PASSED!\n");
  console.log("Summary Statistics:", JSON.stringify(res.stats, null, 2));
}
