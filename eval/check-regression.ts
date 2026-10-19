import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(process.cwd());

export function checkRegression() {
  const baselinePath = resolve(ROOT, "eval/results/baseline.json");
  const currentPath = resolve(ROOT, "eval/results/test-rules-corrected.json");

  if (!existsSync(baselinePath)) {
    console.error(`[ERROR] Baseline results file not found at ${baselinePath}`);
    process.exit(1);
  }
  if (!existsSync(currentPath)) {
    console.error(`[ERROR] Current results file not found at ${currentPath}`);
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
  const current = JSON.parse(readFileSync(currentPath, "utf-8"));

  const baselineRec75 = Number(baseline.metrics?.recall75Val ?? 39.4);
  const currentRec75 = Number(current.metrics?.recall75Val ?? 0);

  const baselineFp75 = Number(baseline.metrics?.fpRate75Val ?? 0.0);
  const currentFp75 = Number(current.metrics?.fpRate75Val ?? 0.0);

  const recallDrop = Number((baselineRec75 - currentRec75).toFixed(2));
  const fpRise = Number((currentFp75 - baselineFp75).toFixed(2));

  console.log("======================================================================");
  console.log("ScamShield AI — Rules Regression Gate Check");
  console.log(`Baseline File: eval/results/baseline.json`);
  console.log(`Current File:  eval/results/test-rules-corrected.json`);
  console.log(`- Recall @ Trust < 75: Current ${currentRec75}% vs Baseline ${baselineRec75}% (Delta: ${-recallDrop} pts)`);
  console.log(`- FP Rate @ Trust < 75: Current ${currentFp75}% vs Baseline ${baselineFp75}% (Delta: +${fpRise} pts)`);
  console.log("======================================================================\n");

  let failed = false;

  if (recallDrop > 2.0) {
    console.error(`[GATE FAILURE] Recall @ Trust < 75 dropped by ${recallDrop} percentage points (maximum allowed drop: 2.0 points).`);
    failed = true;
  } else {
    console.log(`[PASS] Recall drop (${recallDrop} pts) <= 2.0 percentage point tolerance.`);
  }

  if (fpRise > 2.0) {
    console.error(`[GATE FAILURE] False-positive rate @ Trust < 75 rose by ${fpRise} percentage points (maximum allowed increase: 2.0 points).`);
    failed = true;
  } else {
    console.log(`[PASS] FP rate rise (${fpRise} pts) <= 2.0 percentage point tolerance.`);
  }

  if (failed) {
    process.exit(1);
  }

  console.log("\n[SUCCESS] Regression check passed with zero gate violations.\n");
}

if (process.argv[1]?.includes("check-regression")) {
  checkRegression();
}
