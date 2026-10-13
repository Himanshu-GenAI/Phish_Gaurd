import { RULES } from "../lib/rules/lexicon";
import { runRules } from "../lib/rules/engine";

const gens: Record<string, (n: number) => string> = {
  dotRun:    n => "a.".repeat(n / 2),
  hyphenRun: n => "a-".repeat(n / 2),
  spaceRun:  n => " ".repeat(n),
  digits:    n => "rs " + "1,".repeat(n / 2),
  nearFee:   n => "registration ".repeat(n / 13),
  nearArea:  n => "parcel " + "x".repeat(n),
};

console.log("=== 1. PATTERN-LEVEL ADVERSARIAL CHECK (scripts/regex-check.ts) ===");
for (const rule of RULES) {
  for (let i = 0; i < rule.patterns.length; i++) {
    const re = rule.patterns[i];
    const id = `${rule.id}-${i}`;
    for (const [name, g] of Object.entries(gens)) {
      const s5k = g(5_000);
      const s20k = g(20_000);
      const s40k = g(40_000);

      // 5 runs median
      const timeRe = (s: string) => {
        const runs: number[] = [];
        for (let k = 0; k < 5; k++) {
          const t = performance.now();
          s.match(re);
          runs.push(performance.now() - t);
        }
        return runs.sort((a, b) => a - b)[2];
      };

      const t5k = timeRe(s5k);
      const t20k = timeRe(s20k);
      const t40k = timeRe(s40k);
      const ratio = t40k / Math.max(t20k, 0.05);

      if (t5k > 50) {
        console.log(`SLOW at cap: ${id} ${name} ${t5k.toFixed(1)}ms`);
      }
      if (ratio > 3.2 && t40k > 20) {
        console.log(`QUADRATIC: ${id} ${name} ${t20k.toFixed(1)}->${t40k.toFixed(1)}ms (x${ratio.toFixed(1)}) [5k: ${t5k.toFixed(2)}ms]`);
      }
    }
  }
}

console.log("\n=== 2. ENGINE-LEVEL (runRules + Negation Guard) ON ADVERSARIAL GENERATORS ===");
for (const [name, g] of Object.entries(gens)) {
  const s5k = g(5_000);
  const s40k = g(40_000);

  const timeEngine = (s: string) => {
    const runs: number[] = [];
    for (let k = 0; k < 5; k++) {
      const t = performance.now();
      runRules(s);
      runs.push(performance.now() - t);
    }
    return runs.sort((a, b) => a - b)[2];
  };

  const t5k = timeEngine(s5k);
  const t40k = timeEngine(s40k);
  console.log(`Generator [${name}]: 5k chars = ${t5k.toFixed(2)}ms | 40k chars = ${t40k.toFixed(2)}ms`);
  if (t5k > 50) {
    console.log(`  FAILED: Engine exceeded 50ms at 5,000 characters on ${name}!`);
  }
}
console.log("\nComplete adversarial check finished.");
