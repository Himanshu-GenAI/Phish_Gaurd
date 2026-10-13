import { readFileSync } from "fs";
import { join } from "path";
import { analyzeText } from "../lib/analyze/pipeline";
import { runRules } from "../lib/rules/engine";
import { SAMPLES } from "../lib/samples";

const INITIAL_GENUINE: Record<string, { risk: number; trust: number; flags: string[] }> = {
  "dev-036": { risk: 25, trust: 75, flags: ["otp"] },
  "dev-037": { risk: 25, trust: 75, flags: ["otp"] },
  "dev-038": { risk: 3, trust: 97, flags: [] },
  "dev-039": { risk: 3, trust: 97, flags: [] },
  "dev-040": { risk: 3, trust: 97, flags: [] },
  "dev-041": { risk: 3, trust: 97, flags: [] },
  "dev-042": { risk: 52, trust: 48, flags: ["fee", "authority", "secrecy", "corporate-email"] },
  "dev-043": { risk: 3, trust: 97, flags: [] },
  "dev-044": { risk: 3, trust: 97, flags: [] },
  "dev-045": { risk: 3, trust: 97, flags: [] },
  "dev-046": { risk: 3, trust: 97, flags: [] },
  "dev-047": { risk: 20, trust: 80, flags: ["authority"] },
  "dev-048": { risk: 3, trust: 97, flags: [] },
  "dev-049": { risk: 3, trust: 97, flags: [] },
  "dev-050": { risk: 3, trust: 97, flags: [] },
  "dev-051": { risk: 3, trust: 97, flags: [] },
  "dev-052": { risk: 3, trust: 97, flags: [] },
  "dev-053": { risk: 3, trust: 97, flags: [] },
  "dev-054": { risk: 3, trust: 97, flags: [] },
  "dev-055": { risk: 3, trust: 97, flags: [] },
  "dev-056": { risk: 3, trust: 97, flags: [] },
  "dev-057": { risk: 3, trust: 97, flags: [] },
  "dev-058": { risk: 3, trust: 97, flags: [] },
  "dev-059": { risk: 3, trust: 97, flags: [] },
  "dev-060": { risk: 3, trust: 97, flags: [] },
  "dev-061": { risk: 3, trust: 97, flags: [] },
  "dev-062": { risk: 20, trust: 80, flags: ["authority"] },
  "dev-063": { risk: 3, trust: 97, flags: [] },
  "dev-064": { risk: 3, trust: 97, flags: [] },
  "dev-065": { risk: 3, trust: 97, flags: [] },
  "dev-066": { risk: 3, trust: 97, flags: [] },
  "dev-067": { risk: 25, trust: 75, flags: ["fee"] },
  "dev-068": { risk: 3, trust: 97, flags: [] },
  "dev-069": { risk: 3, trust: 97, flags: [] },
  "dev-070": { risk: 3, trust: 97, flags: [] },
};

export function runMeasure() {
  const root = process.cwd();
  const devPath = join(root, "eval", "dataset", "dev.json");

  const devItems: Array<{ id: string; label: string; text: string }> = JSON.parse(readFileSync(devPath, "utf-8"));

  let tp50 = 0, fp50 = 0, tn50 = 0, fn50 = 0;
  let tp75 = 0, fn75 = 0;
  const genuineChanged: Array<{ id: string; oldTrust: number; newTrust: number; oldFlags: string[]; newFlags: string[] }> = [];

  const evaluated: Array<{ id: string; label: string; risk: number; trust: number; flags: string[] }> = [];

  for (const item of devItems) {
    const res = analyzeText(item.text, { aiHits: [], domainResults: [] });
    const current = {
      id: item.id,
      label: item.label,
      risk: res.risk,
      trust: res.trust,
      flags: res.flags.map((f) => f.id),
    };
    evaluated.push(current);

    const isScam = item.label === "scam";
    const pred50Scam = res.trust < 50;
    const pred75Scam = res.trust < 75;

    if (isScam) {
      if (pred50Scam) tp50++; else fn50++;
      if (pred75Scam) tp75++; else fn75++;
    } else {
      if (pred50Scam) fp50++; else tn50++;

      const b = INITIAL_GENUINE[item.id];
      if (b && (b.trust !== res.trust || b.risk !== res.risk || JSON.stringify(b.flags) !== JSON.stringify(current.flags))) {
        genuineChanged.push({
          id: item.id,
          oldTrust: b.trust,
          newTrust: res.trust,
          oldFlags: b.flags,
          newFlags: current.flags,
        });
      }
    }
  }

  // ROC AUC
  const pairs = evaluated.map((e) => ({ score: e.risk, isPositive: e.label === "scam" }));
  pairs.sort((a, b) => b.score - a.score);
  const totalPos = pairs.filter((p) => p.isPositive).length;
  const totalNeg = pairs.length - totalPos;
  let rankSum = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j < pairs.length && pairs[j].score === pairs[i].score) j++;
    const avgRank = pairs.length - (i + j - 1) / 2;
    for (let k = i; k < j; k++) {
      if (pairs[k].isPositive) rankSum += avgRank;
    }
    i = j;
  }
  const rocAuc = Number(((rankSum - (totalPos * (totalPos + 1)) / 2) / (totalPos * totalNeg)).toFixed(4));

  // 4 original samples
  const sampleScores: Record<string, number> = {};
  for (const s of SAMPLES) {
    const res = analyzeText(s.text, { aiHits: [], domainResults: [] });
    sampleScores[s.label] = res.trust;
  }

  // Regex Timing on 5,000 characters
  const adversarial = "urgent ".repeat(500) + "a ".repeat(600) + "https://" + "x".repeat(1200) + ".test";
  const str5k = adversarial.slice(0, 5000);
  for (let k = 0; k < 10; k++) runRules(str5k);
  const start = performance.now();
  const ITERS = 100;
  for (let k = 0; k < ITERS; k++) runRules(str5k);
  const durationMs = (performance.now() - start) / ITERS;

  return {
    recall50: `${tp50}/${tp50 + fn50} (${((tp50 / (tp50 + fn50)) * 100).toFixed(1)}%)`,
    recall75: `${tp75}/${tp75 + fn75} (${((tp75 / (tp75 + fn75)) * 100).toFixed(1)}%)`,
    fpCount: `${fp50}/${fp50 + tn50}`,
    rocAuc,
    genuineChanged,
    sampleScores,
    timingMs: Number(durationMs.toFixed(3)),
    evaluated,
  };
}

if (process.argv[1]?.includes("measure-dev")) {
  const m = runMeasure();
  console.log(JSON.stringify(m, null, 2));
}
