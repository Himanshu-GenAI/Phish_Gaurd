import type { VerdictBand } from "./types";

export interface BandMeta {
  label: string;
  text: string;
  ring: string;
  hint: string;
}

export const BAND_META: Record<VerdictBand, BandMeta> = {
  genuine: {
    label: "Likely Genuine",
    text: "text-emerald-600",
    ring: "#10b981",
    hint: "Standard caution advised — no known fraud patterns or suspicious entities were detected.",
  },
  suspicious: {
    label: "Suspicious",
    text: "text-amber-600",
    ring: "#f59e0b",
    hint: "Exercise caution — contains patterns commonly used in unsolicited or unverified messages.",
  },
  risky: {
    label: "High Risk",
    text: "text-orange-600",
    ring: "#ea580c",
    hint: "Likely fraudulent — upfront fee, personal payment handles, or pressure tactics detected.",
  },
  scam: {
    label: "Almost Certainly a Scam",
    text: "text-red-600",
    ring: "#dc2626",
    hint: "Critical risk match — extortion, impersonation, or high-confidence scam markers present. Do not pay or share OTPs.",
  },
};
