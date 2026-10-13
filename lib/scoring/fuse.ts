export type RiskBand = "safe" | "suspicious" | "high_risk" | "scam";

export interface ScoreBreakdown {
  rules: number;
  rdap: number;
  ai: number;
  raw_risk: number;
  risk: number;
  degraded: string[];
  skipped?: string[];
}

export interface FusionResult {
  trust: number;
  band: RiskBand;
  raw_risk: number;
  risk: number;
  breakdown: ScoreBreakdown;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getBand(trust: number): RiskBand {
  if (trust >= 75) return "safe";
  if (trust >= 50) return "suspicious";
  if (trust >= 25) return "high_risk";
  return "scam";
}

export function fuseScores(input: {
  rulesRisk: number;
  domainWeight?: number;
  aiWeight?: number;
  degraded?: string[];
  skipped?: string[];
}): FusionResult {
  const rules = input.rulesRisk;
  const rdap = input.domainWeight ?? 0;
  const ai = input.aiWeight ?? 0;
  const raw_risk = rules + rdap + ai;
  const risk = clamp(raw_risk, 3, 100);
  const trust = 100 - risk;
  const band = getBand(trust);

  const breakdown: ScoreBreakdown = {
    rules,
    rdap,
    ai,
    raw_risk,
    risk,
    degraded: input.degraded ? [...input.degraded] : [],
  };

  if (input.skipped && input.skipped.length > 0) {
    breakdown.skipped = [...input.skipped];
  }

  return {
    trust,
    band,
    raw_risk,
    risk,
    breakdown,
  };
}
