import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { wilsonScoreInterval } from '../eval/run';

describe('Wilson Interval Consistency in eval/results/*.json', () => {
  it('matches all intervals stored in eval/results/test-full-2026-10-18.json within 0.05 percentage points', () => {
    const data = JSON.parse(readFileSync('eval/results/test-full-2026-10-18.json', 'utf-8'));

    // Check false alarm summary
    const fa = data.falseAlarmSummary;
    const checkCi = (actual: { ciLower: number; ciUpper: number }, k: number, n: number) => {
      const expected = wilsonScoreInterval(k, n);
      expect(Math.abs(actual.ciLower - expected.ciLower)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(actual.ciUpper - expected.ciUpper)).toBeLessThanOrEqual(0.05);
    };

    checkCi(fa.dev.rulesOnlyBelow75.ci, 0, 35);
    checkCi(fa.dev.rulesAiBelow75.ci, 1, 35);
    checkCi(fa.testCorrectedGenuine.rulesOnlyBelow75.ci, 0, 17);
    checkCi(fa.testCorrectedGenuine.rulesAiBelow75.ci, 0, 17);
    checkCi(fa.stressTestV1.rulesOnlyBelow75.ci, 3, 30);
    checkCi(fa.stressTestV1.rulesAiBelow75.ci, 6, 30);
    checkCi(fa.stressTestV2.rulesOnlyBelow75.ci, 0, 30);
    checkCi(fa.stressTestV2.rulesAiBelow75.ci, 2, 30);

    // Check sealed evaluation
    const s = data.sealedEvaluation;
    checkCi(s.rulesOnly.recall50.ci, 0, 25);
    checkCi(s.rulesOnly.recall75.ci, 9, 25);
    checkCi(s.rulesOnly.fpRate50.ci, 3, 25);
    checkCi(s.rulesOnly.fpRate75.ci, 4, 25);
    checkCi(s.full.recall50.ci, 18, 25);
    checkCi(s.full.recall75.ci, 24, 25);
    checkCi(s.full.fpRate50.ci, 8, 25);
    checkCi(s.full.fpRate75.ci, 8, 25);

    // Check corrected evaluation
    const c = data.correctedEvaluation;
    checkCi(c.rulesOnly.recall50.ci, 3, 33);
    checkCi(c.rulesOnly.recall75.ci, 13, 33);
    checkCi(c.rulesOnly.fpRate50.ci, 0, 17);
    checkCi(c.rulesOnly.fpRate75.ci, 0, 17);
    checkCi(c.full.recall50.ci, 26, 33);
    checkCi(c.full.recall75.ci, 32, 33);
    checkCi(c.full.fpRate50.ci, 0, 17);
    checkCi(c.full.fpRate75.ci, 0, 17);

    // Check author breakdown
    const byAuth = c.byAuthorRecall;
    checkCi(byAuth.assistantScams.rules50.ci, 0, 25);
    checkCi(byAuth.assistantScams.rules75.ci, 9, 25);
    checkCi(byAuth.assistantScams.full50.ci, 18, 25);
    checkCi(byAuth.assistantScams.full75.ci, 24, 25);

    checkCi(byAuth.ownerScams.rules50.ci, 3, 8);
    checkCi(byAuth.ownerScams.rules75.ci, 4, 8);
    checkCi(byAuth.ownerScams.full50.ci, 8, 8);
    checkCi(byAuth.ownerScams.full75.ci, 8, 8);
  });

  it('matches all intervals stored in eval/results/test-rules-2026-10-14.json within 0.05 percentage points', () => {
    const data = JSON.parse(readFileSync('eval/results/test-rules-2026-10-14.json', 'utf-8'));
    const cs = data.comparisonSummary;
    const checkCi = (actual: { ciLower: number; ciUpper: number }, k: number, n: number) => {
      const expected = wilsonScoreInterval(k, n);
      expect(Math.abs(actual.ciLower - expected.ciLower)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(actual.ciUpper - expected.ciUpper)).toBeLessThanOrEqual(0.05);
    };

    checkCi(cs.untunedBaselineDev.recall50.ci, 0, 35);
    checkCi(cs.untunedBaselineDev.recall75.ci, 7, 35);
    checkCi(cs.untunedBaselineDev.fpRate50.ci, 1, 35);
    checkCi(cs.untunedBaselineDev.fpRate75.ci, 1, 35);
    checkCi(cs.untunedBaselineDev.precision50.ci, 0, 1);
    checkCi(cs.untunedBaselineDev.precision75.ci, 7, 8);
    checkCi(cs.untunedBaselineDev.specificity50.ci, 34, 35);
    checkCi(cs.untunedBaselineDev.specificity75.ci, 34, 35);

    checkCi(cs.tunedDev.recall50.ci, 3, 35);
    checkCi(cs.tunedDev.recall75.ci, 14, 35);
    checkCi(cs.tunedDev.fpRate50.ci, 0, 35);
    checkCi(cs.tunedDev.fpRate75.ci, 0, 35);
    checkCi(cs.tunedDev.precision50.ci, 3, 3);
    checkCi(cs.tunedDev.precision75.ci, 14, 14);
    checkCi(cs.tunedDev.specificity50.ci, 35, 35);
    checkCi(cs.tunedDev.specificity75.ci, 35, 35);
  });
});
