import type { RuleHit } from "@/lib/rules/types";

interface FlagCardProps {
  flag: RuleHit;
  index: number;
}

export default function FlagCard({ flag, index }: FlagCardProps) {
  const isLegitimacy = flag.weight < 0;
  const pillColor = isLegitimacy
    ? "bg-green-900/50 text-green-400 border-green-700/50"
    : "bg-red-900/50 text-red-400 border-red-700/50";
  const weightLabel = isLegitimacy
    ? `${flag.weight}`
    : `+${flag.weight}`;

  return (
    <div
      className="flex flex-col gap-1 py-3 px-4 rounded-xl bg-slate-800/50 border border-slate-700/50 opacity-0 animate-fade-in-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${pillColor}`}
        >
          {weightLabel}
        </span>
        <span className="text-sm text-slate-200 font-medium">
          {flag.label}
        </span>
        {flag.category && (
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {flag.category}
          </span>
        )}
      </div>
      {flag.evidence && (
        flag.category === "ai" ? (
          <p className="text-xs text-slate-400 italic pl-1">
            <span className="not-italic font-semibold text-slate-400">AI rationale: </span>
            {flag.evidence}
          </p>
        ) : (
          <p className="text-xs text-slate-400 italic pl-1">
            &ldquo;{flag.evidence}&rdquo;
          </p>
        )
      )}
    </div>
  );
}
