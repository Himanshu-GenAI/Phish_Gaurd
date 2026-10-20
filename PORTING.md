# ScamShield AI — Pinterest-Style UI · Porting Guide

Drop this frontend into your existing pre-built ScamShield project.
**Keep your own engine + API.** Only 2 npm packages and 7 files.

---

## Step 1 — Install dependencies (only 2)

```bash
npm i framer-motion lucide-react
```

No shadcn/ui, no other libraries are used. All Tailwind classes are standard
(arbitrary values `text-[13px]`, `bg-[#...]`, CSS `columns-*` masonry all work
in Tailwind v3 AND v4).

## Step 2 — Copy the files (same folder layout)

```
src/
├── app/
│   └── page.tsx                  ← replaces your current home page
├── components/
│   └── scam/
│       ├── pattern-card.tsx      ← feed cards (Pinterest masonry)
│       ├── result-view.tsx       ← full result panel
│       ├── score-gauge.tsx       ← animated Trust gauge
│       └── flag-card.tsx         ← evidence-quoted red flags
└── lib/
    └── scam/
        ├── types.ts              ← the UI/API contract (see Step 3)
        └── corpus.ts             ← 10 sample messages for the feed + chips
```

> If you already have `lib/scam/types.ts`, **merge** instead of overwrite —
> the UI only needs the interfaces listed in Step 3.
> If you already have your own corpus, you can swap the entries in
> `corpus.ts` — just keep the exported names (`CORPUS`, `SAMPLE_CHIP_IDS`,
> `Channel`).

## Step 3 — Match the API contract (the ONE thing that matters)

The UI calls your existing endpoint:

```
POST /api/analyze
Body:  { "text": "..." }            ← text tab
       { "audioBase64": "..." }     ← voice tab (.ogg/.mp3, base64, no multipart)
```

and expects this JSON back (`AnalyzeResult`):

```ts
interface AnalyzeResult {
  trustScore: number;          // 0–100
  riskScore: number;           // 100 − trustScore
  band: "genuine" | "suspicious" | "risky" | "scam";
  scamType: string | null;     // e.g. "digital_arrest" | null
  flags: {
    layer: "rules" | "live" | "ai";
    id: string;
    label: string;             // short headline, e.g. "Fake fees"
    weight: number;            // +risk or −risk (negative = legitimacy signal)
    evidence: string;          // exact quote from the message
    reason?: string;
  }[];
  entities: {
    urls: { url: string; domain: string; ageDays: number | null }[];
    upiHandles: string[];
    amounts: string[];
    emails: string[];
  };
  breakdown: { rules: number; live: number; ai: number };  // per-layer risk pts
  aiAvailable: boolean;
  transcript: string | null;   // voice tab: the transcribed text
  familyNote: string;          // simple Hinglish explainer for parents
  latencyMs: number;
}
```

### If your API returns a different shape

Do NOT rewrite your engine. Add a tiny adapter in `page.tsx` before `setResult`:

```ts
function mapToAnalyzeResult(d: any): AnalyzeResult {
  return {
    trustScore: d.trust ?? d.trustScore,
    riskScore: 100 - (d.trust ?? d.trustScore),
    band: d.band ?? bandFromScore(d.trust ?? 50),
    scamType: d.scamType ?? null,
    flags: (d.flags ?? []).map((f: any) => ({
      layer: f.layer, id: f.id, label: f.label,
      weight: f.weight, evidence: f.evidence ?? "", reason: f.reason,
    })),
    entities: d.entities ?? { urls: [], upiHandles: [], amounts: [], emails: [] },
    breakdown: d.breakdown ?? { rules: 0, live: 0, ai: 0 },
    aiAvailable: d.aiAvailable ?? false,
    transcript: d.transcript ?? null,
    familyNote: d.familyNote ?? "",
    latencyMs: d.latencyMs ?? 0,
  };
}
// then: setResult(mapToAnalyzeResult(data))
```

## Step 4 — Fonts (optional)

The design was built with **Geist** via `next/font/google`. To keep it:

```tsx
// src/app/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
```

Any sans font works — the UI uses generic `font-sans` / `font-mono` tokens.

## Step 5 — Metadata

```ts
export const metadata: Metadata = {
  title: "ScamShield AI — Paste. Verify. Stay safe.",
  description:
    "Real-time fraud forensics for Indian messaging. Paste any suspicious message or voice note and get an explainable Trust Score with evidence-quoted red flags.",
};
```

## Step 6 — Verify

```bash
npm run dev
```

Checklist:
1. Feed of scam pattern cards renders in 2–3 masonry columns (1 on mobile)
2. Search + channel filter chips (All / WhatsApp / SMS / Email) work
3. Text tab: paste a scam → Trust gauge animates → flags quote evidence
4. Voice tab: pick an .ogg → transcript card appears
5. Genuine messages (e.g. family lunch) stay green — no false positive

## Common gotchas

| Symptom | Fix |
|---|---|
| `Cannot find module "@/lib/scam/corpus"` | Your repo uses `../lib` not `@/lib`? Adjust the import alias in `tsconfig.json` or rewrite imports to relative paths. |
| Masonry shows 1 column everywhere | `columns-1 sm:columns-2 lg:columns-3` requires Tailwind ≥3.0 — fine on any recent install. |
| Gauge doesn't animate | `framer-motion` not installed, or old `motion` API — use `npm i framer-motion@latest`. |
| Voice tab 400 error | Your API must accept `{ audioBase64 }` JSON — if yours expects FormData, decode base64 in the route before passing to Gemini. |
| Fonts look different | You skipped Step 4 — either add Geist or accept your current font. |
