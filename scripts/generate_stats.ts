import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface DatasetItem {
  id: string;
  text: string;
  label: "scam" | "genuine";
  scam_type: string;
  language: "en" | "hinglish" | "mixed";
  difficulty: "easy" | "hard";
  source: string;
  channel: string;
  keyword_free?: boolean;
}

const ROOT = resolve(process.cwd());
const devPath = resolve(ROOT, "eval/dataset/dev.json");
const testPath = resolve(ROOT, "eval/dataset/test.json");
const statsPath = resolve(ROOT, "eval/dataset/STATS.md");

const dev: DatasetItem[] = JSON.parse(readFileSync(devPath, "utf-8"));
const test: DatasetItem[] = JSON.parse(readFileSync(testPath, "utf-8"));

const testPopulated = test.filter((i) => i.text.trim().length > 0);


function countBy<T>(arr: T[], fn: (item: T) => string): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const item of arr) {
    const k = fn(item);
    acc[k] = (acc[k] || 0) + 1;
  }
  return acc;
}

// 1. Label x Split
const devByLabel = countBy(dev, (i) => i.label);
const testPopByLabel = countBy(testPopulated, (i) => i.label);

// 2. Scam Type x Split
const allScamTypes = [
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
];
const devByScamType = countBy(dev, (i) => i.scam_type);
const testPopByScamType = countBy(testPopulated, (i) => i.scam_type);

// 3. Language x Split
const devByLang = countBy(dev, (i) => i.language);
const testPopByLang = countBy(testPopulated, (i) => i.language);

// 4. Difficulty x Label x Split
const devDiffLabel = countBy(dev, (i) => `${i.label}_${i.difficulty}`);
const testPopDiffLabel = countBy(testPopulated, (i) => `${i.label}_${i.difficulty}`);

// 5. Channel x Split
const allChannels = ["sms", "whatsapp", "email", "call_transcript"];
const devByChannel = countBy(dev, (i) => i.channel);
const testPopByChannel = countBy(testPopulated, (i) => i.channel);

// 6. Keyword Free Share
const devScams = dev.filter((i) => i.label === "scam");
const devKeywordFree = devScams.filter((i) => i.keyword_free === true).length;
const devKeywordFreePct = ((devKeywordFree / devScams.length) * 100).toFixed(1);

// 7. Hard Negatives & Hard Scams
const devHardScams = dev.filter((i) => i.label === "scam" && i.difficulty === "hard").length;
const testPopHardScams = testPopulated.filter((i) => i.label === "scam" && i.difficulty === "hard").length;

const devHardNegatives = dev.filter((i) => i.label === "genuine" && i.difficulty === "hard").length;
const testPopHardNegatives = testPopulated.filter((i) => i.label === "genuine" && i.difficulty === "hard").length;

const devGenuineTotal = dev.filter((i) => i.label === "genuine").length;
const testPopGenuineTotal = testPopulated.filter((i) => i.label === "genuine").length;

const devHardNegPct = ((devHardNegatives / devGenuineTotal) * 100).toFixed(1);
const testPopHardNegPct = ((testPopHardNegatives / testPopGenuineTotal) * 100).toFixed(1);

const diffPercentagePoints = (Number(devHardNegPct) - Number(testPopHardNegPct)).toFixed(1);

// Build Markdown
let md = `# ScamShield AI — Full Dataset Distribution & Cross-Tabulations (STATS.md)

*Generated from dataset metadata only. Verbatim test texts are omitted to protect the integrity of the sealed test split.*

---

## 1. Split & Label Distribution

| Label | Dev Split (n=70) | Test Split Populated (n=40) | Test Owner Slots (n=10) | Test Total (n=50) | Overall Dataset (n=120) |
|---|---|---|---|---|---|
| **Scam** | ${devByLabel["scam"] || 0} (50.0%) | ${testPopByLabel["scam"] || 0} (62.5%) | 0 | 25 (50.0%) | 60 (50.0%) |
| **Genuine** | ${devByLabel["genuine"] || 0} (50.0%) | ${testPopByLabel["genuine"] || 0} (37.5%) | 10 (100.0%) | 25 (50.0%) | 60 (50.0%) |
| **Total** | 70 | 40 | 10 | 50 | 120 |

---

## 2. Scam Type by Split

| Scam Type | Dev Split (Scam n=35) | Test Split Populated (Scam n=25) | Total Scams (n=60) |
|---|---|---|---|
`;

for (const st of allScamTypes) {
  if (st === "none") continue;
  md += `| \`${st}\` | ${devByScamType[st] || 0} | ${testPopByScamType[st] || 0} | ${(devByScamType[st] || 0) + (testPopByScamType[st] || 0)} |\n`;
}

md += `| **Genuine (\`none\`)** | ${devByScamType["none"] || 0} | ${testPopByScamType["none"] || 0} (+10 owner slots) | 60 |\n`;

md += `
---

## 3. Language Distribution by Split

| Language | Dev Split (n=70) | Test Split Populated (n=40) | Target (Dev) |
|---|---|---|---|
| **English (\`en\`)** | ${devByLang["en"] || 0} (${((devByLang["en"] / 70) * 100).toFixed(1)}%) | ${testPopByLang["en"] || 0} (${((testPopByLang["en"] / 40) * 100).toFixed(1)}%) | 28 (40.0%) |
| **Hinglish (\`hinglish\`)** | ${devByLang["hinglish"] || 0} (${((devByLang["hinglish"] / 70) * 100).toFixed(1)}%) | ${testPopByLang["hinglish"] || 0} (${((testPopByLang["hinglish"] / 40) * 100).toFixed(1)}%) | 23 (32.9%) |
| **Mixed Code-Switching (\`mixed\`)** | ${devByLang["mixed"] || 0} (${((devByLang["mixed"] / 70) * 100).toFixed(1)}%) | ${testPopByLang["mixed"] || 0} (${((testPopByLang["mixed"] / 40) * 100).toFixed(1)}%) | 19 (27.1%) |

---

## 4. Difficulty Breakdown by Label & Split

| Category | Dev Split (n=70) | Test Split Populated (n=40) |
|---|---|---|
| **Scam — Easy** | ${devDiffLabel["scam_easy"] || 0} | ${testPopDiffLabel["scam_easy"] || 0} |
| **Scam — Hard (Evasive / Keyword-Free)** | ${devHardScams} | ${testPopHardScams} |
| **Genuine — Easy** | ${devDiffLabel["genuine_easy"] || 0} | ${testPopDiffLabel["genuine_easy"] || 0} |
| **Genuine — Hard (Hard Negative)** | ${devHardNegatives} | ${testPopHardNegatives} |

---

## 5. Channel Distribution by Split

| Channel | Dev Split (n=70) | Test Split Populated (n=40) |
|---|---|---|
`;

for (const ch of allChannels) {
  md += `| \`${ch}\` | ${devByChannel[ch] || 0} | ${testPopByChannel[ch] || 0} |\n`;
}

md += `
---

## 6. Keyword-Free Scam Share

- **Dev Split Scams:** ${devKeywordFree} / ${devScams.length} (**${devKeywordFreePct}%**) are tagged \`keyword_free: true\` (Target: $\\ge 45\\%$).
- Features evasive cues without obvious rule trigger phrases (e.g. polite starter-kit purchases, balance pledges, institutional vouchers, unverified courier hold notices).

---

## 7. Hard-Negative & Hard-Scam Analysis

| Metric | Dev Split | Test Split Populated | Total Across Splits |
|---|---|---|---|
| **Hard Scams (Evasive)** | ${devHardScams} / 35 (${((devHardScams / 35) * 100).toFixed(1)}%) | ${testPopHardScams} / 25 (${((testPopHardScams / 25) * 100).toFixed(1)}%) | ${devHardScams + testPopHardScams} / 60 |
| **Hard Negatives (Genuine)** | ${devHardNegatives} / ${devGenuineTotal} (**${devHardNegPct}%**) | ${testPopHardNegatives} / ${testPopGenuineTotal} (**${testPopHardNegPct}%**) | ${devHardNegatives + testPopHardNegatives} / 50 (Target: $\\ge 28$) |

### ⚠️ Distribution Divergence Warning & Owner Slot Recommendation

> **Warning:** Dev genuine hard-negative share (${devHardNegPct}%) and test populated genuine hard-negative share (${testPopHardNegPct}%) currently differ by **${diffPercentagePoints} percentage points**, exceeding the 15 percentage-point parity threshold.
>
> **Remediation via 10 Owner Slots (\`test-USER-01\` to \`10\`):**
> - **Total genuine test items:** 15 (currently populated) + 10 (owner slots) = 25 genuine items.
> - **Parity target:** Dev genuine hard-negative share is 24 / 35 = 68.6%. To satisfy the $\\le 15$ percentage-point parity threshold, test genuine hard-negative share must be $\\ge 53.6\\%$ (since $68.57\\% - 15.00\\% = 53.57\\%$, rounded to 53.6%).
> - **Required hard negatives:** $\\lceil 25 \\times 0.5357 \\rceil = 14$ hard negatives minimum in test.
> - **Current status:** The populated test split already provides **${testPopHardNegatives}** hard negatives.
> - **Owner slot quota:** The project owner must supply **at least 8 hard negatives out of their 10 inbox slots** ($14 - 6 = 8$).
> - **Resulting distribution:** Providing 8 hard negatives yields $14 / 25 = 56.0\\%$ hard negatives (a gap of $12.6$ percentage points, within the 15 pp threshold). Providing 9 yields $15 / 25 = 60.0\\%$ (gap of $8.6$ pp).
`;

writeFileSync(statsPath, md, "utf-8");
console.log("Successfully generated STATS.md!");
