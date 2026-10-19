import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(process.cwd());

export function generateReadmeEvaluationMarkdown(): string {
  const testFull = JSON.parse(readFileSync(resolve(ROOT, "eval/results/test-full-2026-10-18.json"), "utf-8"));
  const devFull = JSON.parse(readFileSync(resolve(ROOT, "eval/results/dev-full-2026-10-18.json"), "utf-8"));
  const devBaseline = JSON.parse(readFileSync(resolve(ROOT, "eval/baseline_dev.json"), "utf-8"));
  const smokeV1 = JSON.parse(readFileSync(resolve(ROOT, "eval/results/smoke-v1-full-2026-10-19.json"), "utf-8"));
  const smokeV2 = JSON.parse(readFileSync(resolve(ROOT, "eval/results/smoke-full-2026-10-18.json"), "utf-8"));

  const c = testFull.correctedEvaluation;
  const s = testFull.sealedEvaluation;
  const devR = devFull.pairedMetrics.rules;
  const devF = devFull.pairedMetrics.full;
  const baseP = devBaseline.primary;
  const baseS = devBaseline.secondary;

  const fmtPct = (val: number) => val.toFixed(1) + "%";
  const fmtCi = (ci: { ciLower: number; ciUpper: number } | [number, number]) => {
    if (Array.isArray(ci)) {
      return `[${fmtPct(ci[0])}, ${fmtPct(ci[1])}]`;
    }
    return `[${fmtPct(ci.ciLower)}, ${fmtPct(ci.ciUpper)}]`;
  };

  const md = `### 1. Held-Out Test Evaluation — Corrected Ground Truth (33 Scams / 17 Genuine)

> ⚠️ **Post-Hoc Label Correction**: Owner-item labels (\`test-USER-01\` through \`test-USER-08\`) were mislabeled as genuine at fill time by \`fill-owner-slots.ts\` and corrected to scam post-hoc based on project owner notes written before the sealed run (documented in [eval/dataset/test.label-corrections.json](eval/dataset/test.label-corrections.json)). Both corrected and as-sealed tables are reported.

| Metric | Rules-Only (Corrected) | Rules + AI (Corrected) | Absolute Delta | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Recall @ Trust < 50** | ${c.rulesOnly.recall50.fraction} (${fmtPct(c.rulesOnly.recall50.value)}) ${fmtCi(c.rulesOnly.recall50.ci)} | **${c.full.recall50.fraction} (${fmtPct(c.full.recall50.value)})** ${fmtCi(c.full.recall50.ci)} | **+${(c.full.recall50.value - c.rulesOnly.recall50.value).toFixed(1)}%** | Primary high-confidence threshold |
| **Recall @ Trust < 75** | ${c.rulesOnly.recall75.fraction} (${fmtPct(c.rulesOnly.recall75.value)}) ${fmtCi(c.rulesOnly.recall75.ci)} | **${c.full.recall75.fraction} (${fmtPct(c.full.recall75.value)})** ${fmtCi(c.full.recall75.ci)} | **+${(c.full.recall75.value - c.rulesOnly.recall75.value).toFixed(1)}%** | Secondary caution screening threshold |
| **False-Positive Rate (<50)** | ${c.rulesOnly.fpRate50.fraction} (${fmtPct(c.rulesOnly.fpRate50.value)}) ${fmtCi(c.rulesOnly.fpRate50.ci)} | **${c.full.fpRate50.fraction} (${fmtPct(c.full.fpRate50.value)})** ${fmtCi(c.full.fpRate50.ci)} | **0.0%** | Zero false alarms on genuine items |
| **False-Positive Rate (<75)** | ${c.rulesOnly.fpRate75.fraction} (${fmtPct(c.rulesOnly.fpRate75.value)}) ${fmtCi(c.rulesOnly.fpRate75.ci)} | **${c.full.fpRate75.fraction} (${fmtPct(c.full.fpRate75.value)})** ${fmtCi(c.full.fpRate75.ci)} | **0.0%** | Zero false alarms at caution |
| **Precision @ Trust < 50** | ${fmtPct(c.rulesOnly.precision50.value)} ${fmtCi(c.rulesOnly.precision50.ci)} | **${fmtPct(c.full.precision50.value)}** ${fmtCi(c.full.precision50.ci)} | 0.0% | *(precision on a balanced/curated set is not real-world precision)* |
| **Precision @ Trust < 75** | ${fmtPct(c.rulesOnly.precision75.value)} ${fmtCi(c.rulesOnly.precision75.ci)} | **${fmtPct(c.full.precision75.value)}** ${fmtCi(c.full.precision75.ci)} | 0.0% | *(precision on a balanced/curated set is not real-world precision)* |
| **Specificity @ Trust < 50** | ${fmtPct(c.rulesOnly.spec50.value)} ${fmtCi(c.rulesOnly.spec50.ci)} | **${fmtPct(c.full.spec50.value)}** ${fmtCi(c.full.spec50.ci)} | 0.0% | True negative rate |
| **Accuracy @ Trust < 50** | ${fmtPct(c.rulesOnly.acc50.value)} ${fmtCi(c.rulesOnly.acc50.ci)} | **${fmtPct(c.full.acc50.value)}** ${fmtCi(c.full.acc50.ci)} | **+${(c.full.acc50.value - c.rulesOnly.acc50.value).toFixed(1)}%** | Binary classification accuracy |
| **ROC AUC (1,000 bootstrap CI)** | ${c.rulesOnly.auc.toFixed(4)} [${c.rulesOnly.aucCi[0].toFixed(4)}, ${c.rulesOnly.aucCi[1].toFixed(4)}] | **${c.full.auc.toFixed(4)}** [${c.full.aucCi[0].toFixed(4)}, ${c.full.aucCi[1].toFixed(4)}] | **+${(c.full.auc - c.rulesOnly.auc).toFixed(4)}** | Bootstrap seed 42 |

### 2. Sealed Held-Out Test Set Evaluation (As-Sealed, 25 Scams / 25 Genuine)

> *Evaluation recorded prior to post-hoc label correction ([eval/results/test-full-2026-10-18.json](eval/results/test-full-2026-10-18.json)).*

| Metric | Rules-Only (Sealed) | Rules + AI (Sealed) | Absolute Delta | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Recall @ Trust < 50** | ${s.rulesOnly.recall50.fraction} (${fmtPct(s.rulesOnly.recall50.value)}) ${fmtCi(s.rulesOnly.recall50.ci)} | **${s.full.recall50.fraction} (${fmtPct(s.full.recall50.value)})** ${fmtCi(s.full.recall50.ci)} | **+${(s.full.recall50.value - s.rulesOnly.recall50.value).toFixed(1)}%** | Primary threshold |
| **Recall @ Trust < 75** | ${s.rulesOnly.recall75.fraction} (${fmtPct(s.rulesOnly.recall75.value)}) ${fmtCi(s.rulesOnly.recall75.ci)} | **${s.full.recall75.fraction} (${fmtPct(s.full.recall75.value)})** ${fmtCi(s.full.recall75.ci)} | **+${(s.full.recall75.value - s.rulesOnly.recall75.value).toFixed(1)}%** | Caution threshold |
| **False-Positive Rate (<50)** | ${s.rulesOnly.fpRate50.fraction} (${fmtPct(s.rulesOnly.fpRate50.value)}) ${fmtCi(s.rulesOnly.fpRate50.ci)} | **${s.full.fpRate50.fraction} (${fmtPct(s.full.fpRate50.value)})** ${fmtCi(s.full.fpRate50.ci)} | +${(s.full.fpRate50.value - s.rulesOnly.fpRate50.value).toFixed(1)}% | 8 mislabeled owner scams counted as genuine |
| **False-Positive Rate (<75)** | ${s.rulesOnly.fpRate75.fraction} (${fmtPct(s.rulesOnly.fpRate75.value)}) ${fmtCi(s.rulesOnly.fpRate75.ci)} | **${s.full.fpRate75.fraction} (${fmtPct(s.full.fpRate75.value)})** ${fmtCi(s.full.fpRate75.ci)} | +${(s.full.fpRate75.value - s.rulesOnly.fpRate75.value).toFixed(1)}% | 8 mislabeled owner scams counted as genuine |
| **ROC AUC (1,000 bootstrap CI)** | ${s.rulesOnly.auc.toFixed(4)} [${s.rulesOnly.aucCi[0].toFixed(4)}, ${s.rulesOnly.aucCi[1].toFixed(4)}] | **${s.full.auc.toFixed(4)}** [${s.full.aucCi[0].toFixed(4)}, ${s.full.aucCi[1].toFixed(4)}] | **+${(s.full.auc - s.rulesOnly.auc).toFixed(4)}** | Bootstrap seed 42 |

### 3. By-Author Scam Recall Breakdown (Corrected Test Split)

| Author Group | Total Scams | Rules-Only (<50) | Rules-Only (<75) | Rules + AI (<50) | Rules + AI (<75) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Assistant-Written Scams** | 25 | ${c.byAuthorRecall.assistantScams.rules50.fraction} (${fmtPct(c.byAuthorRecall.assistantScams.rules50.value)}) ${fmtCi(c.byAuthorRecall.assistantScams.rules50.ci)} | ${c.byAuthorRecall.assistantScams.rules75.fraction} (${fmtPct(c.byAuthorRecall.assistantScams.rules75.value)}) ${fmtCi(c.byAuthorRecall.assistantScams.rules75.ci)} | **${c.byAuthorRecall.assistantScams.full50.fraction} (${fmtPct(c.byAuthorRecall.assistantScams.full50.value)})** ${fmtCi(c.byAuthorRecall.assistantScams.full50.ci)} | **${c.byAuthorRecall.assistantScams.full75.fraction} (${fmtPct(c.byAuthorRecall.assistantScams.full75.value)})** ${fmtCi(c.byAuthorRecall.assistantScams.full75.ci)} |
| **Owner-Written Scams** | 8 | ${c.byAuthorRecall.ownerScams.rules50.fraction} (${fmtPct(c.byAuthorRecall.ownerScams.rules50.value)}) ${fmtCi(c.byAuthorRecall.ownerScams.rules50.ci)} | ${c.byAuthorRecall.ownerScams.rules75.fraction} (${fmtPct(c.byAuthorRecall.ownerScams.rules75.value)}) ${fmtCi(c.byAuthorRecall.ownerScams.rules75.ci)} | **${c.byAuthorRecall.ownerScams.full50.fraction} (${fmtPct(c.byAuthorRecall.ownerScams.full50.value)})** ${fmtCi(c.byAuthorRecall.ownerScams.full50.ci)} | **${c.byAuthorRecall.ownerScams.full75.fraction} (${fmtPct(c.byAuthorRecall.ownerScams.full75.value)})** ${fmtCi(c.byAuthorRecall.ownerScams.full75.ci)} |

> 📌 **Note on Dataset Independence & AI Driver**: The AI layer drives most of the detection: on the corrected test set, rules-only recall is only 3/33 (9.1%) at Trust < 50 and 13/33 (39.4%) at Trust < 75; adding the AI layer increases recall to 26/33 (78.8%) and 32/33 (97.0%). Furthermore, neither the dev nor the test scams are independent of the system: assistant-written items were written by the same AI assistant that built the system, and the 8 owner scams were authored with knowledge of the rules (two mirror README demo samples). Performance numbers on messages from the wild may be lower.

### 4. Development Set Tuning Progression (35 Scams / 35 Genuine)

| Metric | Untuned Baseline Rules ([eval/baseline_dev.json](eval/baseline_dev.json)) | Tuned Rules ([eval/results/dev-tuned-2026-10-14.json](eval/results/dev-tuned-2026-10-14.json)) | Rules + AI Full Mode ([eval/results/dev-full-2026-10-18.json](eval/results/dev-full-2026-10-18.json)) |
| :--- | :--- | :--- | :--- |
| **Recall @ Trust < 50** | 0/35 (0.0%) ${fmtCi(baseP.rec)} | 3/35 (8.6%) ${fmtCi(devR.recall50Ci)} | **25/35 (71.4%)** [54.9%, 83.7%] |
| **Recall @ Trust < 75** | 7/35 (20.0%) ${fmtCi(baseS.rec)} | 14/35 (40.0%) ${fmtCi(devR.recall75Ci)} | **35/35 (100.0%)** [90.1%, 100.0%] |
| **False-Positive Rate (<50)** | 1/35 (2.9%) ${fmtCi([0.5, 14.5])} | 0/35 (0.0%) ${fmtCi(devR.fpRate50Ci)} | **0/35 (0.0%)** ${fmtCi([0.0, 9.9])} |
| **False-Positive Rate (<75)** | 1/35 (2.9%) ${fmtCi([0.5, 14.5])} | 0/35 (0.0%) ${fmtCi(devR.fpRate75Ci)} | **1/35 (2.9%)** [0.5%, 14.5%] |
| **ROC AUC** | ${devBaseline.rocAuc.toFixed(4)} | ${devFull.pairedMetrics.rules.rocAuc.toFixed(4)} [${devR.rocAucBootstrap95CI[0].toFixed(4)}, ${devR.rocAucBootstrap95CI[1].toFixed(4)}] | **${devF.rocAuc.toFixed(4)}** [${devF.rocAucBootstrap95CI[0].toFixed(4)}, ${devF.rocAucBootstrap95CI[1].toFixed(4)}] |

### 5. Development vs. Held-Out Test Comparison

| Metric | Dev Split (35/35) | Sealed Test Split (25/25) | Corrected Test Split (33/17) |
| :--- | :--- | :--- | :--- |
| **Rules Recall @ Trust < 50** | 3/35 (8.6%) | 0/25 (0.0%) | 3/33 (9.1%) |
| **Rules Recall @ Trust < 75** | 14/35 (40.0%) | 9/25 (36.0%) | 13/33 (39.4%) |
| **Rules FP Rate (<75)** | 0/35 (0.0%) | 4/25 (16.0%)* | 0/17 (0.0%) |
| **Rules ROC AUC** | 0.8073 | 0.6704* | 0.8458 |
| **Rules + AI Recall @ Trust < 50** | 25/35 (71.4%) | 18/25 (72.0%) | 26/33 (78.8%) |
| **Rules + AI Recall @ Trust < 75** | 35/35 (100.0%) | 24/25 (96.0%) | 32/33 (97.0%) |
| **Rules + AI FP Rate (<75)** | 1/35 (2.9%) | 8/25 (32.0%)* | 0/17 (0.0%) |
| **Rules + AI ROC AUC** | 0.9988 | 0.7560* | 0.9955 |

*\*Sealed test FP and AUC were impacted by 8 owner-written scams initially labeled as genuine.*

### 6. Deliberately Seeded Stress Tests (Genuine Edge Cases)

> ⚠️ **Evaluation Protocol**: Described strictly as deliberately seeded stress tests on challenging genuine edge cases (urgent family requests, maintenance dues, remote-desktop IT troubleshooting, and courier queries). These counts must not be pooled or described as general false-positive rates.

| Stress Test Corpus | Items | Rules-Only (<75) | Rules-Only (<50) | Rules + AI (<75) | Rules + AI (<50) | Results File | Key Failure Modes / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stress Test v1** | 30 | 3/30 (10.0%) | 0/30 (0.0%) | 6/30 (20.0%) | 1/30 (3.3%) | [eval/results/smoke-v1-full-2026-10-19.json](eval/results/smoke-v1-full-2026-10-19.json) | Flagged below 50: \`E-05\` (legitimate IT support request to install AnyDesk for router issue, Trust 40). Flagged below 75: urgent fund transfers (\`H-01\`, \`E-12\`), maintenance dues (\`H-03\`), society notice (\`H-14\`), laptop repair (\`E-06\`). |
| **Stress Test v2** | 30 | 0/30 (0.0%) | 0/30 (0.0%) | 2/30 (6.7%) | 0/30 (0.0%) | [eval/results/smoke-full-2026-10-18.json](eval/results/smoke-full-2026-10-18.json) | Flagged below 75: \`H-03\` (society meter charges, Trust 70), \`H-04\` (sweets delivery boy pin code, Trust 65). Zero flagged below 50. |

> **Failure Modes**: The AI layer and the deterministic rules both raise suspicion on legitimate urgent, money-related, or remote-support messages. When messages contain phrases like *"install AnyDesk"*, *"transfer fund urgently"*, or *"maintenance charges 500"*, risk scoring increases even on benign communication.

### 7. Measured One-Click Demo Sample Scores

| Sample | Ground Truth | Rules Only (Degraded Mode) | With AI (Full Mode) | Risk Band | AI Threat Signals |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Digital arrest** | scam | **20 / 100** | **0 / 100** | 🔴 Scam | 2 signals: Law Enforcement Impersonation (+25), Time-pressure demand (+25) |
| **Fake internship** | scam | **13 / 100** | **0 / 100** | 🔴 Scam | 3 signals: Telegram-only HR (+20), Upfront registration fee (+25), Exaggerated earnings (+20) |
| **Investment group** | scam | **25 / 100** | **0 / 100** | 🔴 Scam | 3 signals: Guaranteed daily returns (+25), Advance tax demand (+20), Secret group trading (+15) |
| **Genuine offer** | genuine | **97 / 100** | **97 / 100** | 🟢 Safe | 0 signals: Legitimacy signals reduce risk to floor of 3 (Trust 97) |`;

  return md;
}

if (process.argv.includes("--print")) {
  console.log(generateReadmeEvaluationMarkdown());
}

if (process.argv.includes("--update")) {
  const readmePath = resolve(ROOT, "README.md");
  const readme = readFileSync(readmePath, "utf-8");
  const startMarker = "<!-- EVAL-TABLES-START -->";
  const endMarker = "<!-- EVAL-TABLES-END -->";

  const startIndex = readme.indexOf(startMarker);
  const endIndex = readme.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    console.error("Markers <!-- EVAL-TABLES-START --> and <!-- EVAL-TABLES-END --> not found in README.md");
    process.exit(1);
  }

  const newReadme =
    readme.slice(0, startIndex + startMarker.length) +
    "\n\n" +
    generateReadmeEvaluationMarkdown() +
    "\n\n" +
    readme.slice(endIndex);

  writeFileSync(readmePath, newReadme, "utf-8");
  console.log("README.md successfully updated with latest evaluation tables.");
}
