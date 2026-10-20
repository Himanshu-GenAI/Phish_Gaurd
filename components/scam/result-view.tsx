"use client";

import { useState } from "react";
import { AtSign, Check, Copy, IndianRupee, Link2, Mic, PhoneCall, ShieldCheck, Users } from "lucide-react";
import { ScoreGauge } from "./score-gauge";
import { FlagCard } from "./flag-card";
import { BAND_META } from "@/lib/scam/fusion";
import type { AnalyzeResult } from "@/lib/scam/types";

function LayerChip({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        ok ? "bg-neutral-100 text-neutral-700" : "bg-neutral-100 text-neutral-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-300"}`} aria-hidden />
      {label} {ok ? value : "offline"}
    </span>
  );
}

/** The full analysis verdict — gauge, evidence-quoted flags, next steps, family note. */
export function ResultView({ result }: { result: AnalyzeResult }) {
  const band = BAND_META[result.band];
  const [copied, setCopied] = useState(false);
  const riskyFlags = result.flags.filter((f) => f.weight !== 0);

  const copyNote = async () => {
    try {
      await navigator.clipboard.writeText(result.familyNote);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-label="Analysis result" className="mx-auto w-full max-w-5xl">
      {/* Verdict card */}
      <div className="rounded-[32px] border border-black/[0.04] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] md:p-8">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:gap-10">
          <div className="shrink-0">
            <ScoreGauge value={result.trustScore} color={band.ring} />
          </div>

          <div className="min-w-0 flex-1 text-center md:text-left">
            <p className={`text-2xl font-extrabold tracking-tight ${band.text}`}>{band.label}</p>
            {result.scamType ? (
              <p className="mt-1 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">
                {result.scamType}
              </p>
            ) : null}
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{band.hint}</p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <LayerChip label="Rules" ok={result.breakdown.rules !== 0} value={`+${result.breakdown.rules}`} />
              <LayerChip label="Live RDAP" ok={result.breakdown.live !== 0} value={`+${result.breakdown.live}`} />
              <LayerChip label="AI" ok={result.aiAvailable} value={`+${result.breakdown.ai}`} />
              <span className="text-xs text-neutral-400">analyzed in {result.latencyMs} ms</span>
            </div>

            {result.transcript ? (
              <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-left">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
                  <Mic className="h-3.5 w-3.5" aria-hidden /> Verbatim transcript
                </p>
                <p className="mt-1.5 text-sm italic leading-relaxed text-neutral-600">{result.transcript}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Extracted entities */}
        {(result.entities.urls.length > 0 || result.entities.upiHandles.length > 0 || result.entities.amounts.length > 0) && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-5">
            {result.entities.urls.map((u) => (
              <span
                key={`url-${u.url}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                title={u.ageDays !== null ? `Domain age: ${u.ageDays} days` : "Domain age unknown"}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {u.domain}
                {u.ageDays !== null ? ` · ${u.ageDays}d old` : ""}
              </span>
            ))}
            {result.entities.upiHandles.map((h) => (
              <span
                key={`upi-${h}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700"
              >
                <AtSign className="h-3.5 w-3.5" aria-hidden />
                {h}
              </span>
            ))}
            {result.entities.amounts.map((a) => (
              <span
                key={`amt-${a}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600"
              >
                <IndianRupee className="h-3.5 w-3.5" aria-hidden />
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Evidence-quoted flags */}
      <h3 className="mt-8 px-1 text-lg font-bold tracking-tight text-neutral-900">
        Why this verdict {riskyFlags.length > 0 ? `· ${riskyFlags.length} signals` : ""}
      </h3>
      {riskyFlags.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {riskyFlags.map((f, i) => (
            <FlagCard key={`${f.id}-${i}`} flag={f} />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-5">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
          <p className="text-[15px] font-medium text-emerald-800">
            No red flags found — every deterministic rule, live check and semantic signal came back clean.
          </p>
        </div>
      )}

      {/* Family mode + next steps */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-[28px] border border-black/[0.04] bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-400">
              <Users className="h-4 w-4" aria-hidden /> Family mode · forwardable
            </p>
            <button
              type="button"
              onClick={copyNote}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-200"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy note"}
            </button>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-700">{result.familyNote}</p>
        </div>

        <div className="rounded-[28px] bg-neutral-900 p-6 text-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] lg:col-span-2">
          <p className="text-sm font-bold uppercase tracking-wider text-neutral-400">Scammed? Act in the golden hour</p>
          <ol className="mt-4 space-y-3">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600">
                <PhoneCall className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm leading-snug">
                Call <strong className="font-bold">1930</strong> — national cyber helpline
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-sm">2</span>
              <span className="text-sm leading-snug">
                Report at <strong className="font-bold">cybercrime.gov.in</strong>
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-sm">3</span>
              <span className="text-sm leading-snug">
                Inform your bank + <strong className="font-bold">Chakshu</strong> portal
              </span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
