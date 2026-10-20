"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  AudioLines,
  FileAudio,
  Loader2,
  MessageSquare,
  Mic,
  Search,
  ShieldCheck,
  Text as TextIcon,
  X,
} from "lucide-react";

import { CORPUS, SAMPLE_CHIP_IDS, type Channel } from "@/lib/scam/corpus";
import { PatternCard } from "@/components/scam/pattern-card";
import { ResultView } from "@/components/scam/result-view";
import type { AnalyzeResult } from "@/lib/scam/types";

type Tab = "text" | "voice";
type FeedFilter = "all" | Channel;

const SAMPLES = SAMPLE_CHIP_IDS.map((id) => CORPUS.find((c) => c.id === id)!).filter(Boolean);

const CHANNEL_FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "Email" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileB64, setFileB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FeedFilter>("all");

  const resultRef = useRef<HTMLDivElement>(null);

  const analyze = useCallback(
    async (textOverride?: string, audioB64Override?: string | null) => {
      setError(null);
      const t = (textOverride ?? text).trim();
      const audio = audioB64Override ?? (tab === "voice" ? fileB64 : null);

      if (!t && !audio) {
        setError("Paste a suspicious message first — or switch to the voice tab.");
        return;
      }
      if (loading) return;

      setLoading(true);
      setResult(null);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(audio && !t ? { audioBase64: audio } : { text: t }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Analysis failed.");
        setResult(data as AnalyzeResult);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [text, tab, fileB64, loading]
  );

  const runSample = useCallback(
    (sampleText: string) => {
      setTab("text");
      setText(sampleText);
      analyze(sampleText, null);
    },
    [analyze]
  );

  const onPickFile = (f: File | null) => {
    setFile(f);
    setFileB64(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setFileB64(dataUrl.includes(",") ? dataUrl.split(",")[1] : null);
    };
    reader.readAsDataURL(f);
  };

  const filtered = CORPUS.filter((c) => {
    if (filter !== "all" && c.channel !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.scamType.toLowerCase().includes(q) ||
      c.signals.toLowerCase().includes(q) ||
      c.text.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-neutral-900">
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#FAF8F5]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <a href="#" className="flex items-center gap-2.5" aria-label="ScamShield AI home">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600">
              <ShieldCheck className="h-5 w-5 text-white" aria-hidden />
            </span>
            <span className="text-lg font-extrabold tracking-tight">ScamShield</span>
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              AI
            </span>
          </a>
          <a
            href="tel:1930"
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Scammed? Call 1930
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-3xl px-4 pt-12 text-center md:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Real-time fraud forensics · India-first · Privacy by design
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-[3.4rem]">
            Every scam has a pattern.
            <br />
            Paste it. Get the <span className="text-red-600">verdict.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-500 md:text-base">
            A fraud analyst in everyone&apos;s pocket — one paste away. Explainable Trust Score with every red flag
            quoted from <em>your own message</em>. Nothing stored, ever.
          </p>
        </section>

        {/* ── Analyze panel ───────────────────────────────────────────── */}
        <section className="mx-auto mt-8 w-full max-w-3xl px-4" aria-label="Analyze a message">
          <div className="rounded-[32px] border border-black/[0.04] bg-white p-4 shadow-[0_6px_28px_rgba(0,0,0,0.07)] md:p-5">
            <div className="flex items-center justify-center gap-1 rounded-full bg-neutral-100 p-1 md:inline-flex">
              {(
                [
                  { id: "text", label: "Paste message", icon: TextIcon },
                  { id: "voice", label: "Voice note", icon: Mic },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all md:flex-none ${
                    tab === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            {tab === "text" ? (
              <div className="mt-3">
                <label htmlFor="scam-input" className="sr-only">
                  Suspicious message
                </label>
                <textarea
                  id="scam-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={4000}
                  rows={5}
                  placeholder="Paste any suspicious message, job offer, UPI request or link here…"
                  className="w-full resize-none rounded-2xl bg-neutral-50 p-4 text-[15px] leading-relaxed text-neutral-800 outline-none ring-red-600/20 transition placeholder:text-neutral-400 focus:bg-white focus:ring-4"
                />
                <div className="mt-3 flex items-center justify-between px-1">
                  <span className="text-xs tabular-nums text-neutral-400">{text.length}/4000</span>
                  <button
                    type="button"
                    onClick={() => analyze()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                    {loading ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label
                  htmlFor="voice-input"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center transition-colors hover:border-red-300 hover:bg-red-50/40"
                >
                  <input
                    id="voice-input"
                    type="file"
                    accept=".ogg,.oga,.m4a,.mp3,.wav,audio/*"
                    className="sr-only"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <>
                      <FileAudio className="h-8 w-8 text-red-600" aria-hidden />
                      <p className="mt-3 max-w-full truncate text-sm font-semibold text-neutral-800">{file.name}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {(file.size / 1024 / 1024).toFixed(1)} MB · tap to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <AudioLines className="h-8 w-8 text-neutral-400" aria-hidden />
                      <p className="mt-3 text-sm font-semibold text-neutral-700">
                        Upload a WhatsApp voice note (.ogg)
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        Transcribed verbatim in memory · never written to disk · ogg, m4a, mp3, wav
                      </p>
                    </>
                  )}
                </label>
                <div className="mt-3 flex items-center justify-between px-1">
                  {file ? (
                    <button
                      type="button"
                      onClick={() => onPickFile(null)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden /> Remove file
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => analyze()}
                    disabled={loading || !fileB64}
                    className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-red-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                    {loading ? "Transcribing…" : "Analyze voice note"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Try a sample</span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => runSample(s.text)}
                disabled={loading}
                className="rounded-full bg-[#E9E7E3] px-4 py-2 text-xs font-semibold text-neutral-700 transition-all hover:bg-[#DEDBD5] hover:shadow-sm disabled:opacity-50"
              >
                {s.scamType}
              </button>
            ))}
          </div>
        </section>

        {/* ── Result ──────────────────────────────────────────────────── */}
        <div ref={resultRef} className="scroll-mt-24 px-4 pt-12">
          <AnimatePresence>
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-full max-w-5xl"
              >
                <ResultView result={result} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* ── Scam pattern library (masonry feed) ─────────────────────── */}
        <section className="mx-auto mt-16 w-full max-w-6xl px-4 pb-20 md:mt-20" aria-label="Scam pattern library">
          <div className="text-center">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Scam pattern library</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-500">
              Real scam patterns hitting Indian inboxes right now — researched from NCRP complaint trends and
              government advisories. Tap any card to run it through the engine.
            </p>
          </div>

          <div className="mx-auto mt-6 flex max-w-xl items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
              <label htmlFor="feed-search" className="sr-only">
                Search patterns
              </label>
              <input
                id="feed-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patterns… digital arrest, UPI, OTP"
                className="h-11 w-full rounded-full border border-black/5 bg-white pl-11 pr-4 text-sm text-neutral-800 outline-none ring-red-600/20 transition placeholder:text-neutral-400 focus:ring-4"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filter by channel">
            {CHANNEL_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  filter === f.id
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "bg-[#E9E7E3] text-neutral-600 hover:bg-[#DEDBD5]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <div className="mt-8 columns-1 gap-5 sm:columns-2 xl:columns-3">
              {filtered.map((entry) => (
                <PatternCard key={entry.id} entry={entry} onAnalyze={(t) => runSample(t)} />
              ))}
            </div>
          ) : (
            <div className="mx-auto mt-8 max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm">
              <MessageSquare className="mx-auto h-6 w-6 text-neutral-300" aria-hidden />
              <p className="mt-3 text-sm font-medium text-neutral-500">No patterns match your search.</p>
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-black/5 bg-white/70">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-center">
          <p className="text-sm font-bold tracking-tight text-neutral-800">
            Hybrid engine · 18 deterministic rules + live RDAP forensics + capped AI semantic layer
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-neutral-400">
            ScamShield is a risk-assistance and educational tool, not a legal authority. A high score is not proof of
            fraud; a green score is not a guarantee. If you&apos;ve been scammed, call{" "}
            <a href="tel:1930" className="font-semibold text-red-600 hover:underline">
              1930
            </a>{" "}
            or report at cybercrime.gov.in — contacting your bank within the golden hour maximizes recovery. Messages
            are analyzed in memory and never stored.
          </p>
        </div>
      </footer>
    </div>
  );
}
