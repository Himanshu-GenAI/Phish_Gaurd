import { mkdirSync, writeFileSync } from "fs";
import { runMeasure } from "./measure-dev";

mkdirSync("eval/results", { recursive: true });
const m = runMeasure();
const output = {
  split: "dev",
  mode: "rules",
  tunedDate: "2026-10-14",
  evaluatedCount: 70,
  metrics: {
    recall50: m.recall50,
    recall75: m.recall75,
    fpCount: m.fpCount,
    rocAuc: m.rocAuc,
  },
  sampleScores: m.sampleScores,
  timingMs: m.timingMs,
  evaluated: m.evaluated,
};
writeFileSync("eval/results/dev-tuned-2026-10-14.json", JSON.stringify(output, null, 2));
console.log("Saved eval/results/dev-tuned-2026-10-14.json successfully");
