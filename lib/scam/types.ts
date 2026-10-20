export type VerdictBand = "genuine" | "suspicious" | "risky" | "scam";

export type FlagLayer = "rules" | "live" | "ai";

export interface ScamFlag {
  layer: FlagLayer;
  id: string;
  label: string;
  weight: number; // positive = risk added, negative = legitimacy signal
  evidence: string;
  reason?: string;
}

export interface UrlEntity {
  url: string;
  domain: string;
  ageDays: number | null;
}

export interface Entities {
  urls: UrlEntity[];
  upiHandles: string[];
  amounts: string[];
  emails: string[];
}

export interface AnalyzeResult {
  trustScore: number;
  riskScore: number;
  band: VerdictBand;
  scamType: string | null;
  flags: ScamFlag[];
  entities: Entities;
  breakdown: { rules: number; live: number; ai: number };
  aiAvailable: boolean;
  transcript: string | null;
  familyNote: string;
  latencyMs: number;
}
