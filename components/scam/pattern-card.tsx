"use client";

import { ArrowUpRight, Mail, MessageCircle, MessageSquare } from "lucide-react";
import type { CorpusEntry } from "@/lib/scam/corpus";

const CHANNEL_ICON = {
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
} as const;

const CHANNEL_LABEL = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
} as const;

function bandTone(trust: number) {
  if (trust >= 75)
    return { band: "from-emerald-100 to-teal-50", score: "text-emerald-600", chip: "bg-emerald-600" };
  if (trust >= 50) return { band: "from-amber-100 to-yellow-50", score: "text-amber-600", chip: "bg-amber-500" };
  if (trust >= 25) return { band: "from-orange-100 to-amber-50", score: "text-orange-600", chip: "bg-orange-500" };
  return { band: "from-red-100 to-rose-50", score: "text-red-600", chip: "bg-red-600" };
}

/** Masonry "pin" card for the Scam Pattern Library feed. */
export function PatternCard({ entry, onAnalyze }: { entry: CorpusEntry; onAnalyze: (text: string) => void }) {
  const tone = bandTone(entry.referenceTrust);
  const ChannelIcon = CHANNEL_ICON[entry.channel];
  const genuine = entry.referenceTrust >= 75;

  return (
    <article className="break-inside-avoid mb-5 overflow-hidden rounded-3xl border border-black/[0.04] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(0,0,0,0.10)]">
      {/* Visual header — the "pin image" */}
      <div className={`relative flex h-28 items-center justify-between bg-gradient-to-br px-5 ${tone.band}`}>
        <div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white ${tone.chip}`}>
            {genuine ? "Control sample" : "Known pattern"}
          </span>
          <p className="mt-2 text-xl font-extrabold tracking-tight text-neutral-900">{entry.scamType}</p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-extrabold tabular-nums ${tone.score}`}>{entry.referenceTrust}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">ref. trust</p>
        </div>
      </div>

      <div className="p-5">
        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-neutral-600">{entry.text}</p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            <ChannelIcon className="h-3.5 w-3.5" aria-hidden />
            {CHANNEL_LABEL[entry.channel]}
          </span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
            {entry.language}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              entry.difficulty === "hard" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
            }`}
          >
            {entry.difficulty === "hard" ? "Hard to catch" : "Easy"}
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-neutral-400">{entry.signals}</p>

        <button
          type="button"
          onClick={() => onAnalyze(entry.text)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 transition-colors hover:text-red-700"
          aria-label={`Analyze the ${entry.scamType} sample in the engine`}
        >
          Analyze this
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}
