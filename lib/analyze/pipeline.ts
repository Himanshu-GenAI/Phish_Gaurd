import { runRules, ruleRisk } from "../rules/engine";
import { extractUrls, extractUpiHandles, extractAmounts } from "../checks/entities";
import type { DomainCheck } from "../checks/rdap";
import type { RuleHit } from "../rules/types";
import { fuseScores, type ScoreBreakdown, type RiskBand } from "../scoring/fuse";

export interface PipelineOptions {
  domainResults?: DomainCheck[];
  aiHits?: RuleHit[];
  degraded?: string[];
  skipped?: string[];
}

export interface PipelineResult {
  trust: number;
  band: RiskBand;
  raw_risk: number;
  risk: number;
  flags: RuleHit[];
  ruleHits: RuleHit[];
  domainFlags: RuleHit[];
  aiHits: RuleHit[];
  entities: {
    urls: string[];
    upi: string[];
    amounts: string[];
  };
  breakdown: ScoreBreakdown;
}

export function analyzeText(text: string, opts?: PipelineOptions): PipelineResult {
  // Layer 1: Rule engine (deterministic, pure)
  let ruleHits: RuleHit[] = [];
  try {
    ruleHits = runRules(text);
  } catch {
    ruleHits = [];
  }

  const urls = extractUrls(text).slice(0, 3);
  const upi = extractUpiHandles(text);
  const amounts = extractAmounts(text);

  // Layer 2: Live domain results mapping
  const domainResults = opts?.domainResults ?? [];
  const domainFlags: RuleHit[] = domainResults
    .filter((d) => d.weight > 0)
    .map((d) => ({
      id: "domain_age",
      label: d.note,
      category: "live",
      weight: d.weight,
      evidence: d.domain,
    }));
  const domainWeight = domainResults.reduce((s, d) => s + d.weight, 0);

  // Layer 3: AI results mapping
  const aiHits: RuleHit[] = opts?.aiHits ?? [];
  const aiWeight = aiHits.reduce((s, h) => s + h.weight, 0);

  // Degraded vs skipped tracking
  // If opts is omitted, we are in pure rules-only evaluation: unattempted layers are 'skipped', not 'degraded'
  const isRulesOnly = !opts;
  const degraded = opts?.degraded ? [...opts.degraded] : [];
  const skipped = opts?.skipped ?? (isRulesOnly ? ["domain-check", "ai-analysis"] : undefined);

  // Fusion scoring
  const fusion = fuseScores({
    rulesRisk: ruleRisk(ruleHits),
    domainWeight,
    aiWeight,
    degraded,
    skipped,
  });

  const flags = [...ruleHits, ...aiHits, ...domainFlags].sort(
    (a, b) => Math.abs(b.weight) - Math.abs(a.weight)
  );

  return {
    trust: fusion.trust,
    band: fusion.band,
    raw_risk: fusion.raw_risk,
    risk: fusion.risk,
    flags,
    ruleHits,
    domainFlags,
    aiHits,
    entities: {
      urls,
      upi,
      amounts,
    },
    breakdown: fusion.breakdown,
  };
}
