import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

export interface OwnerItemInput {
  text: string;
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

  const allowedLanguages = new Set(["en", "hinglish", "mixed"]);
  const allowedDifficulties = new Set(["easy", "hard"]);
  const allowedChannels = new Set(["sms", "whatsapp", "email", "call_transcript"]);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item.text !== "string" || item.text.trim().length === 0) {
      throw new Error(`[VALIDATION ERROR] Item at index ${i} has empty or non-string text.`);
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
  const testItems: any[] = JSON.parse(testRaw);

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
      label: "genuine",
      scam_type: "none",
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
  } catch (err: any) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
}
