import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

export interface OwnerItemInput {
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
  channel: "sms" | "whatsapp" | "email" | "call_transcript";
  notes?: string;
}

export function fillOwnerSlots(options?: {
  ownerItemsPath?: string;
  testJsonPath?: string;
  shaPath?: string;
  statsScriptPath?: string;
}) {
  const ROOT = resolve(process.cwd());
  const shaPath = options?.shaPath ?? resolve(ROOT, "eval/dataset/test.sha256");
  const testJsonPath = options?.testJsonPath ?? resolve(ROOT, "eval/dataset/test.json");
  const ownerItemsPath = options?.ownerItemsPath ?? resolve(ROOT, "eval/private/owner-items.json");

  // Invariant 1: Refuse if test.sha256 already exists
  if (existsSync(shaPath)) {
    throw new Error(
      `[REFUSED] ${shaPath} already exists! Cannot fill owner slots once the test split has been sealed.`
    );
  }

  // Invariant 2: Verify owner items file exists
  if (!existsSync(ownerItemsPath)) {
    throw new Error(
      `[NOT FOUND] Private owner file not found at: ${ownerItemsPath}\nPlease create it with 10 genuine items before running this script.`
    );
  }

  const raw = readFileSync(ownerItemsPath, "utf-8");
  const items: OwnerItemInput[] = JSON.parse(raw);

  if (!Array.isArray(items) || items.length !== 10) {
    throw new Error(
      `[INVALID COUNT] Expected exactly 10 items in owner-items.json, received: ${Array.isArray(items) ? items.length : "non-array"}`
    );
  }

  const allowedLabels = new Set(["scam", "genuine"]);
  const allowedScamTypes = new Set([
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
  const allowedLanguages = new Set(["en", "hinglish", "mixed"]);
  const allowedDifficulties = new Set(["easy", "hard"]);
  const allowedChannels = new Set(["sms", "whatsapp", "email", "call_transcript"]);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item.text !== "string" || item.text.trim().length === 0) {
      throw new Error(`[VALIDATION ERROR] Item at index ${i} has empty or non-string text.`);
    }
    if (!item.label || !allowedLabels.has(item.label)) {
      throw new Error(
        `[VALIDATION ERROR] Item at index ${i} must carry an explicit label ('scam' | 'genuine'). Received: '${item.label}'.`
      );
    }
    if (!item.scam_type || !allowedScamTypes.has(item.scam_type)) {
      throw new Error(
        `[VALIDATION ERROR] Item at index ${i} must carry an explicit scam_type. Received: '${item.scam_type}'.`
      );
    }
    if (item.label === "genuine" && item.scam_type !== "none") {
      throw new Error(
        `[VALIDATION ERROR] Item at index ${i} has label 'genuine' but scam_type '${item.scam_type}'. Genuine items must have scam_type 'none'.`
      );
    }
    if (item.label === "scam" && item.scam_type === "none") {
      throw new Error(
        `[VALIDATION ERROR] Item at index ${i} has label 'scam' but scam_type 'none'. Scam items must have a concrete scam_type.`
      );
    }
    if (!allowedLanguages.has(item.language)) {
      throw new Error(`[VALIDATION ERROR] Item at index ${i} has invalid language '${item.language}'.`);
    }
    if (!allowedDifficulties.has(item.difficulty)) {
      throw new Error(`[VALIDATION ERROR] Item at index ${i} has invalid difficulty '${item.difficulty}'.`);
    }
    if (!allowedChannels.has(item.channel)) {
      throw new Error(`[VALIDATION ERROR] Item at index ${i} has invalid channel '${item.channel}'.`);
    }
  }

  // Read test.json
  const testRaw = readFileSync(testJsonPath, "utf-8");
  const testItems: Record<string, unknown>[] = JSON.parse(testRaw);

  const updatedIds: string[] = [];
  let filledCount = 0;

  for (let i = 0; i < 10; i++) {
    const id = `test-USER-${String(i + 1).padStart(2, "0")}`;
    const targetIdx = testItems.findIndex((it) => it.id === id);
    if (targetIdx === -1) {
      throw new Error(`[SLOT NOT FOUND] Could not find slot ${id} in ${testJsonPath}`);
    }

    testItems[targetIdx] = {
      id,
      text: items[i].text,
      label: items[i].label,
      scam_type: items[i].scam_type,
      language: items[i].language,
      difficulty: items[i].difficulty,
      source: "synthetic",
      channel: items[i].channel,
      notes: items[i].notes || "Owner private evaluation inbox sample",
    };

    updatedIds.push(id);
    filledCount++;
  }

  // Write updated test.json
  writeFileSync(testJsonPath, JSON.stringify(testItems, null, 2) + "\n", "utf-8");

  // Regenerate STATS.md if real script
  if (!options?.testJsonPath) {
    try {
      execSync("npx tsx scripts/generate_stats.ts", { stdio: "pipe" });
    } catch {
      // ignore
    }
  }

  return {
    filledCount,
    updatedIds,
    totalTestItems: testItems.length,
  };
}

if (process.argv[1]?.endsWith("fill-owner-slots.ts")) {
  try {
    const result = fillOwnerSlots();
    console.log(`\n======================================================================`);
    console.log(` ScamShield AI — Owner Slots Population Complete`);
    console.log(` Successfully filled slots: ${result.filledCount}`);
    console.log(` Slot IDs updated: ${result.updatedIds.join(", ")}`);
    console.log(` Total items in test.json: ${result.totalTestItems}`);
    console.log(` [PRIVACY GUARANTEE] Item texts were processed and verified without printing.`);
    console.log(`======================================================================\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${message}\n`);
    process.exit(1);
  }
}
