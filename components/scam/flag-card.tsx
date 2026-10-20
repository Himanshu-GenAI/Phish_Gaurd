"use client";

import { Quote } from "lucide-react";
import type { ScamFlag } from "@/lib/scam/types";

const LAYER_TAG: Record<ScamFlag["layer"], string> = {
  rules: "RULE",
  live: "LIVE CHECK",
  ai: "AI",
};

function flagAccent(weight: number) {
  if (weight < 0) return { border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-700" };
  if (weight >= 20) return { border: "border-l-red-500", chip: "bg-red-100 text-red-700" };
  if (weight >= 10) return { border: "border-l-orange-400", chip: "bg-orange-100 text-orange-700" };
  return { border: "border-l-amber-400", chip: "bg-amber-100 text-amber-700" };
}

/** Evidence-quoted red flag card — every point deduction shown with proof. */
export function FlagCard({ flag }: { flag: ScamFlag }) {
  const accent = flagAccent(flag.weight);
  const positive = flag.weight > 0;

  return (
    <article
      className={`break-inside-avoid rounded-2xl border border-black/[0.04] border-l-4 ${accent.border} bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-snug text-neutral-900">{flag.label}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${accent.chip}`}
          aria-label={positive ? `${flag.weight} risk points` : `${Math.abs(flag.weight)} legitimacy points`}
        >
          {positive ? "+" : ""}
          {flag.weight}
        </span>
      </div>

      {flag.evidence ? (
        <blockquote className="mt-3 flex gap-2 rounded-xl bg-neutral-50 px-3 py-2.5">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-300" aria-hidden />
          <p className="text-[13px] italic leading-relaxed text-neutral-600">{flag.evidence}</p>
        </blockquote>
      ) : null}

      {flag.reason ? <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">{flag.reason}</p> : null}

      <span className="mt-3 inline-block rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        {LAYER_TAG[flag.layer]}
      </span>
    </article>
  );
}
