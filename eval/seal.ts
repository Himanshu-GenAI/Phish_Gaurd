import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";

export function sealTestSplit(options?: {
  testJsonPath?: string;
  shaPath?: string;
}) {
  const ROOT = resolve(process.cwd());
  const testJsonPath = options?.testJsonPath ?? resolve(ROOT, "eval/dataset/test.json");
  const shaPath = options?.shaPath ?? resolve(ROOT, "eval/dataset/test.sha256");

  const raw = readFileSync(testJsonPath, "utf-8");
  const items: any[] = JSON.parse(raw);

  const emptySlots: string[] = [];
  for (const item of items) {
    if (!item.text || typeof item.text !== "string" || item.text.trim().length === 0) {
      emptySlots.push(item.id);
    }
  }

  if (emptySlots.length > 0) {
    throw new Error(
      `[SEAL REFUSED] Cannot seal test split while items have empty text!\n` +
        `Empty slot IDs (${emptySlots.length}): ${emptySlots.join(", ")}\n` +
        `Please populate all owner slots with eval/fill-owner-slots.ts before sealing.`
    );
  }

  const hash = createHash("sha256").update(Buffer.from(raw, "utf-8")).digest("hex");
  writeFileSync(shaPath, `${hash}  test.json\n`, "utf-8");

  return {
    itemCount: items.length,
    sha256: hash,
    shaPath,
  };
}

if (process.argv[1]?.endsWith("seal.ts")) {
  try {
    const res = sealTestSplit();
    console.log(`\n======================================================================`);
    console.log(` ScamShield AI — Test Split Sealed Successfully`);
    console.log(` Total Items Sealed: ${res.itemCount}`);
    console.log(` SHA-256 Checksum:   ${res.sha256}`);
    console.log(` Written To:         ${res.shaPath}`);
    console.log(`======================================================================\n`);
  } catch (err: any) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
}
