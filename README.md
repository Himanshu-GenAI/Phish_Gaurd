<div align="center">

# 🛡️ ScamShield AI

### Real-time fraud forensics for Indian messaging — deterministic rule engine, live domain intelligence, explainable AI scoring.

Every scam message has a pattern.

> 🎙️ **v2 (built during HACKDAY 1.0):** Voice-note analysis — upload audio file (WAV is the only verified format; MP3 and OGG/OPUS expected to work, pending live verification; FLAC and AIFF untested; AAC removed pending live verification), get a transcript + Trust Score.

**Paste any suspicious message → Get a Trust Score with evidence-quoted red flags, scam classification, and a family-friendly Hinglish explainer**

[Live Demo](<PASTE_VERCEL_URL>) · [GitHub Repo](https://github.com/Himanshu-GenAI/Hackday-1.0) · [Issues](https://github.com/Himanshu-GenAI/Hackday-1.0/issues) · [How It Works](#-how-the-trust-score-works--the-innovation) · [Try the Samples](#-judges-90-second-demo)

![HACKDAY 1.0](https://img.shields.io/badge/HACKDAY_1.0-Tech_for_a_Better_Tomorrow-22C55E)
![Next.js](https://img.shields.io/badge/Next.js-App_Router-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)
![AI](https://img.shields.io/badge/AI-Gemini_structured_output-4285F4)
![License](https://img.shields.io/badge/License-MIT-green)

Built for HACKDAY 1.0 by DECODEP — v2 voice-note analysis built during the live 8-hour window.

</div>

---

## 🌍 Tech for a Better Tomorrow

The tomorrow we're building is one where a parent hangs up on a "digital arrest" call without fear. Where the evidence of a scam is understood the moment its message arrives — not after the money is gone. Where a ₹499 "registration fee" is recognized as the trap it is. ScamShield exists to make that tomorrow ordinary.

---

## 📖 Contents

[Tech for a Better Tomorrow](#-tech-for-a-better-tomorrow) · [The Problem](#-the-problem) · [Why Existing Tools Fail](#-why-existing-tools-fail) ·
[Our Solution](#-our-solution) · [How the Trust Score Works](#-how-the-trust-score-works--the-innovation) ·
[Scam Taxonomy](#-scam-taxonomy-we-detect) · [Architecture](#️-architecture) ·
[Tech Stack](#️-tech-stack---why) · [Getting Started](#-getting-started) ·
[Limitations](#-limitations) · [Judge's 90-Second Demo](#-judges-90-second-demo) · [Roadmap](#️-roadmap) ·
[Evaluation Criteria](#-hackday-10--evaluation-criteria-mapping-weighted) · [Sources](#-research-sources)

---

## 🚨 The Problem

> ⚠️ *Statistics (2024 data) as reported in media citing I4C / Government of India data — live sources linked below.*

India is in the middle of its largest cyber-fraud wave:

- 💸 **₹22,000+ crore (~US$2.7B)** lost to cyber fraud in Jan–Nov 2024; complaints on the National Cybercrime Reporting Portal crossed **1 crore** (I4C data, via Reuters).
- 👮 **"Digital arrest" scams** — impersonators posing as CBI/customs/police extorted **₹120+ crore in Q1 2024 alone**; the Prime Minister had to address it on Mann Ki Baat: *"No agency ever conducts a digital arrest."*
- 🎓 **Students are prime targets** — fake internships demanding "registration fees", Telegram-only "HR", and too-good-to-be-true work-from-home pay.
- 🎙️ **AI voice cloning** — seconds of audio are enough; India is among the worst-hit countries (McAfee global survey).

**The cruel part:** every one of these scams arrives as a *message*. The victim is holding the evidence and can't read it — by the time they search "is this a scam?", they've often already paid.

**ScamShield puts a fraud analyst in everyone's pocket — one paste away.**

---

## 🔍 Why Existing Tools Fail

| Tool | Checks | Misses |
|---|---|---|
| Google Safe Browsing / VirusTotal | URL blocklists | Message-level context, zero-day pages, non-URL scams |
| Truecaller | Phone numbers | Text scams, job fraud, digital arrest |
| Bank / UPI warnings | Transactions (too late) | The scam starts hours before the payment |
| Asking a chatbot | Generic, inconsistent | No scoring, no live checks, no explainability, no Hinglish |

**The gap:** no tool does *message-level, India-specific, Hinglish-aware, explainable* scam analysis with **live deterministic verification**. ScamShield is built for the scams hitting Indian inboxes *right now*.

---

## 💡 Our Solution

1. **🧭 Trust Score (0–100)** — one glance tells you if it's safe
2. **🚩 Explainable red flags** — every deduction shown *with the exact evidence quoted from your message*
3. **🧬 Scam-type classification** — digital arrest, fake internship, task scam, investment group, and more
4. **✅ "What to do next"** — concrete steps, incl. reporting via **1930** / cybercrime.gov.in / Chakshu
5. **👨‍👩‍👧 Family mode** — a forwardable, jargon-free Hinglish explainer for parents
6. **🎙️ v2 (built during HACKDAY 1.0): Voice-note analysis** — upload audio file (WAV verified; MP3 and OGG/OPUS expected to work, pending live verification; FLAC/AIFF untested), get transcript + Trust Score

![ScamShield Landing Page](public/screenshots/landing.png)

![ScamShield Scam Verdict](public/screenshots/scam-verdict.png)

![ScamShield Genuine Verdict](public/screenshots/genuine-verdict.png)

> 🔒 **Privacy-first:** messages are analyzed in memory and **not persisted by the app** (no database, no disk logging). To generate semantic forensics and transcription, text and audio payloads are transmitted to Google's Gemini API for processing. No login. No tracking.

---

## 🧠 How the Trust Score Works — *The Innovation*

Most "AI detectors" are just a prompt. ScamShield uses a **hybrid three-layer engine**:

```
Risk = clamp( Σ rule weights + Σ live-check weights + Σ AI weights , 3–100 )
Trust = 100 − Risk
```

| Layer | What it checks | Why |
|---|---|---|
| **1. Rule Engine (18 rules)** | Fees, UPI handles, authority impersonation, urgency, Hinglish keywords | Deterministic, explainable, instant — the backbone |
| **2. Live Checks (RDAP)** | Domain registration age | Catches fresh scam infrastructure the rules can't see |
| **3. Gemini (structured JSON)** | Tone, coercion, vagueness, channel mismatch | Catches semantic tricks rules can't — with a strict schema, no hallucinated free text |
| **🎙️ v2: Voice-note analysis** | Upload audio file (WAV verified; MP3 and OGG/OPUS expected to work, pending live verification; FLAC/AIFF untested) | In-memory multimodal speech-to-text forensics via Gemini `inline_data` |

**Why hybrid beats a pure LLM:** rules guarantee *consistency and explainability*, the LLM adds *semantic understanding*, live checks catch *fresh infrastructure* — and **every single point deduction is shown to the user with evidence**. No black box.

### Sample rules (of 18)

| Signal | Weight | Evidence example |
|---|---|---|
| Upfront fee / "registration fee" | +25 | *"pay ₹499 registration fee"* |
| OTP/PIN/CVV request · remote-control app | +25 | *"share the OTP"*, *"install AnyDesk"* |
| Personal UPI handle | +20 | *"pay to quickjobs@ybl"* |
| Authority impersonation / digital arrest | +20 | *"FIR filed against your Aadhaar"* |
| Urgency · "only 2 slots left" | +15 | *"closes today"* |
| HR only on Telegram/WhatsApp | +15 | *"contact HR only on Telegram"* |
| **No-fee statement · formal interview · corporate email** | **−8/−6/−5** | *legitimacy signals reduce risk* |

### Verdict bands

| Trust Score | Verdict |
|---|---|
| 🟢 75–100 | Likely genuine — standard caution |
| 🟡 50–74 | Suspicious — verify independently |
| 🟠 25–49 | High risk — likely scam, don't pay |
| 🔴 0–24 | Almost certainly a scam — report it |

---

## 🎯 Scam Taxonomy We Detect

Researched from NCRP complaint patterns, government advisories, and media reporting:

| # | Type | Signature we encode |
|---|---|---|
| 1 | Digital Arrest | Authority + video call + urgency + secrecy + payment |
| 2 | Fake Job/Internship | Fee + salary/skill mismatch + Telegram-only HR + no interview |
| 3 | Task/Prepayment | Small real payouts first, then "premium tasks" need deposits |
| 4 | Investment/Trading Group | Guaranteed returns + personal UPI + withdrawal "tax/fee" |
| 5 | KYC/Utility/Courier | Link + authority + deadline ("electricity cut tonight") |
| 6 | UPI Collect Fraud | PIN entered to *receive* money — PIN only ever *pays* |
| 7 | Loan-App Extortion | APK + contact harvesting |
| 8 | AI Voice-Clone Emergency | Urgency + unusual payment request from "family" |
| 9 | Fake Customer Care | Unverified number + remote-app install request |
| 10 | Phishing/APK Delivery | Fake KYC pages, malicious APKs via WhatsApp |

---

## 🏗️ Architecture

```mermaid
flowchart TD
    A[User pastes message / link] --> B["POST /api/analyze"]
    B --> C[Preprocessor: extract URLs, UPI handles, amounts]
    D["Layer 1 — Rule Engine\n18 weighted rules, EN + Hinglish"]
    E["Layer 2 — Live checks\nRDAP domain age"]
    F["Layer 3 — gemini-3.8-flash\nstrict JSON schema"]
    C --> D
    C --> E
    C --> F
    D --> G["Score Fusion\nTrust = 100 − clamped risk"]
    E --> G
    F --> G
    G --> H["UI: animated gauge · evidence-quoted flags\nnext steps · family note"]
```

> Privacy by design: stateless pipeline — message text and voice notes are analyzed in memory and discarded without persistence in app databases or local storage. Text and audio payloads are transmitted to Google's Gemini API for processing via REST and multimodal `inline_data`.

---

## 🛠️ Tech Stack — & Why

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | One deploy for UI + API; type-safe contracts |
| Styling | Tailwind CSS | Fast, consistent, dark-theme-first |
| AI | gemini-3.8-flash via REST | Free tier, fast, native structured-JSON (responseSchema) — no SDK lock-in |
| Live checks | RDAP (rdap.org) | Free, keyless, authoritative registration data |
| Rules | Pure TypeScript + regex lexicons | Deterministic, unit-testable, zero cost |
| Hosting | Vercel | Live demo link, zero-config |

> 📌 **Note:** Gemini models are retired on a fixed schedule; set `GEMINI_MODEL` to change the model without editing code. Model availability should be rechecked before submission.

---

## 🚀 Getting Started

```bash
git clone https://github.com/Himanshu-GenAI/Hackday-1.0.git
cd Hackday-1.0
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY (free: aistudio.google.com)
npm run dev                   # → http://localhost:3000
```

**Project structure:**

```
├── app/api/analyze/route.ts   # 3-layer fusion pipeline (text + audio)
├── app/page.tsx               # single-page dark UI with text/voice tabs
├── components/                # ScoreGauge · FlagCard · StepsCard · FamilyNote · TranscriptCard
├── lib/rules/                 # lexicon (18 rules) · engine
├── lib/checks/                # entity extraction · RDAP domain age
├── lib/ai/gemini.ts           # structured-output client (text + audio inline_data)
├── lib/samples.ts             # one-click demo messages
└── samples/                   # sample texts (test corpus)
```

---

## 🧪 Judge's 90-Second Demo

### Empirical Sample Scores (Measured)

| Sample | Rules Only (Degraded Mode) | With AI (Live) | Risk Band | Notes |
|---|---|---|---|---|
| **Digital arrest** | **20 / 100** | Pending re-measure | 🔴 Scam | 5 matching rules (risk 80: authority, kyc-threat, transfer, urgency, secrecy). |
| **Fake internship** | **13 / 100** | Pending re-measure | 🔴 Scam | Rules risk 87. AI signals push risk to 100 clamp (Trust 0) when active. |
| **Investment group** | **25 / 100** | Pending re-measure | 🟠 High risk* | Rules risk 75. *\*Sits right at the boundary of the High Risk band (Trust 25).* |
| **Genuine offer** | **97 / 100** | Pending re-measure | 🟢 Safe | Legitimacy signals reduce risk to floor of 3 (Trust 97). Mock-verified with AI; live AI pending re-measure. |

1. **Digital arrest** (Hinglish pressure tactics):
   > "This is Inspector Rajesh Verma, Cyber Cell Mumbai… to avoid digital arrest, transfer ₹2,40,000 to the RBI verification account within 30 minutes. Do not share this with anyone."
   → 🔴 **Trust 20/100** — authority, urgency, secrecy, transfer all flagged with quoted evidence.

2. **Fake internship** (the student scam):
   > "Selected! ₹5,000/day WFH. Pay ₹499 registration fee via UPI to quickjobs@ybl. Only 2 slots left. HR only on Telegram."
   → 🔴 **Trust 13/100** (rules-only; live AI pending re-measure) — fee, personal UPI, false urgency, channel mismatch, salary mismatch.

3. **Investment group**:
   > Guaranteed returns, upfront fee, personal UPI handle.
   → 🟠 **Trust 25/100** — sits at the edge of the High risk band.

4. **Genuine offer** →
   🟢 **Trust 97/100** with green legitimacy signals (no-fee, formal interview, corporate email; mock-verified with AI, live AI pending re-measure; not a live API result).

5. **The live moment:** paste any link from your spam folder → "Domain registered 6 days ago."

*(Try all four instantly with the one-click sample chips on the homepage.)*

---

## 🗺️ Roadmap

- 🧩 **Chrome extension** — overlay Trust Scores on LinkedIn, Naukri, WhatsApp Web
- 💬 **WhatsApp bot** — forward any message, get the score back
- 🎙️ **Live-call analysis** — real-time speech-to-text risk scoring
- 🌏 **Regional languages** — Tamil, Telugu, Bengali, Marathi lexicons
- 📡 **Community Scam Feed** — anonymized trending-pattern radar
- 🔌 **Open API** — for job platforms to pre-screen postings before students ever see them

> Feasibility note: every roadmap item builds on the existing serverless architecture — no re-architecture required.

---

## 🏆 HACKDAY 1.0 — Evaluation Criteria Mapping (weighted)

| Criterion | Evidence from ScamShield |
|---|---|
| **Problem & Impact (25%)** | • ₹22,000+ cr fraud wave; "digital arrest" ₹120+ cr in Q1 2024 alone<br>• Protects students AND their parents<br>• Intervenes at the MESSAGE stage, before payment |
| **Technical Implementation (25%)** | • 18-rule deterministic weighted engine (EN + Hinglish)<br>• Live RDAP domain-age forensics<br>• Gemini structured-JSON (responseSchema), multimodal text + audio<br>• Score fusion with clamp + floor; graceful degradation |
| **Innovation (20%)** | • Explainable Trust Score — every deduction quoted from user's own text<br>• Live domain-age checks ("registered 6 days ago")<br>• Voice-note analysis with verbatim transcript<br>• Hinglish-first lexicon |
| **User Experience (15%)** | • One paste → full verdict; animated gauge<br>• Family mode for non-tech users<br>• Mobile-first verified <CONFIRM_375PX>; zero login |
| **Feasibility & Scalability (15%)** | • 100% free-tier serverless stack, already deployed on Vercel<br>• Stateless privacy-first design<br>• Roadmap (extension / bot / open API) builds on existing architecture — no re-architecture |

---

## 😤 Challenges & Learnings

- **LLM inconsistency:** identical messages scored differently across runs → solved with `responseSchema` structured output + deterministic rules as the backbone.
- **Hinglish is its own language:** English lexicons miss "registration fee do" → built a custom Hinglish lexicon.
- **False positives destroy trust:** legitimacy signals (no-fee, formal process, corporate domain) are weighted against risk rules so genuine offers stay green.

---

## 📚 Research Sources

*(Source references; direct external URLs unverified.)*

- Reuters — I4C cyber-fraud loss & complaint data, 2024
- Government data tabled in Parliament — digital-arrest losses, Q1 2024
- PM Mann Ki Baat (Oct 2024) — digital-arrest warning
- AICTE/UGC advisories — fake internship/job scams
- McAfee global survey — AI voice-cloning fraud
- NCRP (cybercrime.gov.in) · 1930 helpline · Chakshu portal

---

## ⚠️ Limitations

- **Adversarial & Evasive Text:** Novel scam phrasing or heavily obfuscated characters may evade regex keywords and rely solely on the LLM layer.
- **API Rate Limits & Quotas:** The free Gemini tier enforces a quota of ~20 requests per day per project/model (and 5 requests/minute). Under high traffic, text requests gracefully degrade to rules-only mode, and voice requests report service busy. For a public demo or sustained testing, active billing or a spare API key is required.
- **Audio Verification & Transcription Status:** WAV is currently the only live-verified audio format. MP3 and OGG/OPUS are expected to work, pending live verification (AAC has been removed; FLAC and AIFF are untested). Romanized-Hinglish transcription prompt instructions and the `speech_detected` gating are mock-verified only, pending live quota verification.
- **Genuine Sample Scoring Status:** The genuine sample result (`raw_risk: -19`, `risk: 3`, `trust: 97` with `degraded: []`) is verified deterministically for rules and mock AI injection. It is pending live quota re-measure with Gemini and must not be described as a live API result.
- **Audio Hallucination on Silence:** Audio foundation models can invent text for pure digital silence or background static; during empirical testing with 0-amplitude audio, hallucinated text ("Can you hear me?") was observed before speech-presence gating.
- **Audio File Size Constraints:** Audio uploads are limited to 3 MB raw file size due to Vercel serverless request body constraints (~4.5 MB request limit with base64 encoding).
- **Domain Age Registry Coverage:** RDAP queries depend on authoritative TLD registry availability; unsupported or rate-limited TLDs produce no domain-age signal.
- **Risk Guidance Only:** Trust Scores provide risk guidance and educational awareness; they do not constitute legal determinations of authenticity or fraud.

---

## ⚠️ Disclaimer

ScamShield is a risk-assistance and educational tool, not a legal authority. A high score is not proof of fraud; a green score is not a guarantee. If you've been scammed, act fast: **call 1930** or report at **cybercrime.gov.in** — contacting your bank within the golden hour maximizes recovery chances.

---

## 👥 Team

| Name | GitHub | Contribution |
|---|---|---|
| Himanshu | [@Himanshu-GenAI](https://github.com/Himanshu-GenAI) | Full-stack architecture, rule engine & AI pipeline |
| [Contributor Name] | [@contributor](https://github.com/) | [Frontend / Testing / Design] |

---

## 🐛 Issues

Report issues and feature requests: [https://github.com/Himanshu-GenAI/Hackday-1.0/issues](https://github.com/Himanshu-GenAI/Hackday-1.0/issues)

---

## 🙏 Acknowledgements

Built for HACKDAY 1.0 by DECODEP. AI by Google Gemini · Hosted on Vercel.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

<div align="center"><sub>⭐ If ScamShield saves even one person from losing their savings, this was worth building.</sub></div>
