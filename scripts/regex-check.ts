import { RULES } from "../lib/rules/lexicon";
import type { Rule } from "../lib/rules/types";

const collect = (): { id: string; re: RegExp }[] =>
  RULES.flatMap((r: Rule) =>
    r.patterns.map((re: RegExp, i: number) => ({ id: `${r.id}-${i}`, re }))
  );

const gens: Record<string, (n: number) => string> = {
  dotRun:    n => "a.".repeat(n / 2),
  hyphenRun: n => "a-".repeat(n / 2),
  spaceRun:  n => " ".repeat(n),
  digits:    n => "rs " + "1,".repeat(n / 2),
  nearFee:   n => "registration ".repeat(n / 13),
  nearArea:  n => "parcel " + "x".repeat(n),
};

const time = (re: RegExp, s: string) => {
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); s.match(re); runs.push(performance.now() - t); }
  return runs.sort((a, b) => a - b)[2];
};

for (const { id, re } of collect()) {
  for (const [name, g] of Object.entries(gens)) {
    const small = time(re, g(5_000));
    const a = time(re, g(20_000));
    const b = time(re, g(40_000));
    const ratio = b / Math.max(a, 0.05);
    if (small > 50) console.log(`SLOW at cap: ${id} ${name} ${small.toFixed(1)}ms`);
    if (ratio > 3.2 && b > 20) console.log(`QUADRATIC: ${id} ${name} ${a.toFixed(1)}->${b.toFixed(1)}ms (x${ratio.toFixed(1)})`);
  }
}
console.log("done");
