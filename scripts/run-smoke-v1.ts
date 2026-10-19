import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { loadEnvConfig } from "@next/env";
import { runRules } from "../lib/rules/engine";
import type { RuleHit } from "../lib/rules/types";
import { analyzeWithGemini, geminiSignalsToHits, GEMINI_MODEL, GeminiServiceError } from "../lib/ai/gemini";
import { analyzeText } from "../lib/analyze/pipeline";

loadEnvConfig(process.cwd());

export const SMOKE_V1_MESSAGES = [
  // 15 Hinglish
  { id: "H-01", lang: "Hinglish", text: "Bhai trip ka pending 5000 turant bhej de Google Pay par, hisaab clear karna hai." },
  { id: "H-02", lang: "Hinglish", text: "Doctor appointment sham 5 baje confirm hai, please time se pahunch jana, jaldi nikalna ghar se." },
  { id: "H-03", lang: "Hinglish", text: "Society office me meter replacement ka maintenance charges 500 jama kar dena kal tak." },
  { id: "H-04", lang: "Hinglish", text: "Diwali sweets packet delivery boy aa raha hai, pin code sahi batana." },
  { id: "H-05", lang: "Hinglish", text: "Mummy boli kitchen ke ration ka daily hisaab register me likh do." },
  { id: "H-06", lang: "Hinglish", text: "Bhai swiggy delivery boy ko phone karke bol abhi aane ko." },
  { id: "H-07", lang: "Hinglish", text: "Bachhon ki school picnic ke liye 2000 deposit counter par jama karna hai." },
  { id: "H-08", lang: "Hinglish", text: "Electrician ne bola inverter power battery check kar li hai, sab theek hai." },
  { id: "H-09", lang: "Hinglish", text: "Gaadi service center me hai, delivery milte hi turant nikalenge." },
  { id: "H-10", lang: "Hinglish", text: "Table reserve karne ke liye restaurant gate par QR code scan karke menu dekh lo." },
  { id: "H-11", lang: "Hinglish", text: "Papa ne office se laptop remote setup mangwaya hai IT team se." },
  { id: "H-12", lang: "Hinglish", text: "Tu tension mat le, exam me 100% marks guaranteed nahi hote, bas mehnat kar." },
  { id: "H-13", lang: "Hinglish", text: "Shaadi ki photos Google Drive link par share kar di hain, download kar lo." },
  { id: "H-14", lang: "Hinglish", text: "Yeh personal baat hai, confidential rakhna kisi dost ko mat batana." },
  { id: "H-15", lang: "Hinglish", text: "Aunty bol rahi thi customer care support desk kal band rahega Sunday ki wajah se." },

  // 15 English
  { id: "E-01", lang: "English", text: "Please send your share of the dinner bill via the group payment link tonight." },
  { id: "E-02", lang: "English", text: "The doctor advised a daily walk of thirty minutes to improve stamina." },
  { id: "E-03", lang: "English", text: "Don't forget to pay the monthly maintenance charges before the 10th." },
  { id: "E-04", lang: "English", text: "The apartment key requires a refundable deposit of 500 rupees upon handover." },
  { id: "E-05", lang: "English", text: "Please accept the remote assist invite immediately so IT support can fix your screen." },
  { id: "E-06", lang: "English", text: "Your courier parcel has arrived at the local facility and will reach your pin code today." },
  { id: "E-07", lang: "English", text: "The technician inspected the smart meter to verify electricity power readings." },
  { id: "E-08", lang: "English", text: "Customer support replied that the replacement item is dispatched via standard courier." },
  { id: "E-09", lang: "English", text: "Please complete the university registration form without delay." },
  { id: "E-10", lang: "English", text: "Scan the QR code on the table to access the restaurant's digital dinner menu." },
  { id: "E-11", lang: "English", text: "The bank branch told us international fund transfers take up to three business days." },
  { id: "E-12", lang: "English", text: "Dear tenant, please transfer Rs 15000 rent immediately into my account as the month has ended." },
  { id: "E-13", lang: "English", text: "Good weather is practically guaranteed for our weekend trekking trip." },
  { id: "E-14", lang: "English", text: "This performance review discussion is strictly confidential between manager and employee." },
  { id: "E-15", lang: "English", text: "Please share the meeting agenda document with all project team members." },
];

const ROOT = resolve(process.cwd());
const cacheDir = resolve(ROOT, "eval/cache_smoke_v1");
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

function getCacheKey(model: string, text: string): string {
  const payload = `smoke_v1:${model}:1.0.0:${text}`;
  return createHash("sha256").update(payload, "utf-8").digest("hex");
}

async function run() {
  console.log(`Starting Stress Test v1 (30 deliberately seeded genuine messages)`);
  console.log(`Target Model: ${GEMINI_MODEL} | Cache Dir: eval/cache_smoke_v1/ | Pace: 4s\n`);

  const results: Array<{
    id: string;
    lang: string;
    rulesTrust: number;
    rulesRisk: number;
    rulesBand: string;
    rulesFlags: string[];
    fullTrust: number;
    fullRisk: number;
    fullBand: string;
    aiSignals: Array<{ label: string; weight: number }>;
  }> = [];

  let liveCalls = 0;

  for (let i = 0; i < SMOKE_V1_MESSAGES.length; i++) {
    const item = SMOKE_V1_MESSAGES[i];
    const key = getCacheKey(GEMINI_MODEL, item.text);
    const cacheFile = resolve(cacheDir, `${key}.json`);

    let cached: { aiHits?: RuleHit[] } | null = null;
    if (existsSync(cacheFile)) {
      cached = JSON.parse(readFileSync(cacheFile, "utf-8"));
    }

    if (!cached) {
      const previewHits = runRules(item.text);
      const ruleLabels = previewHits.map((h) => h.label);
      console.log(`[LIVE ${liveCalls + 1}/30] Calling Gemini for ${item.id} (${item.lang})...`);
      let geminiRes;
      try {
        geminiRes = await analyzeWithGemini(item.text, ruleLabels);
      } catch (err) {
        if (err instanceof GeminiServiceError && err.status === 429) {
          console.error(`[CRITICAL] HTTP 429 Quota Exhausted on ${item.id}. Stopping immediately without caching errors.`);
          process.exit(1);
        }
        throw err;
      }

      if (!geminiRes) {
        throw new Error(`Gemini call returned null for ${item.id}`);
      }

      const aiHits = geminiSignalsToHits(geminiRes.ai_signals);
      cached = { aiHits };
      writeFileSync(cacheFile, JSON.stringify(cached, null, 2) + "\n", "utf-8");
      liveCalls++;

      // Pacing 4 seconds between live calls
      if (i < SMOKE_V1_MESSAGES.length - 1) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }

    const aiHits = cached.aiHits || [];
    const fullAnalysis = analyzeText(item.text, { aiHits, domainResults: [] });
    const rulesAnalysis = analyzeText(item.text, { aiHits: [], domainResults: [] });

    results.push({
      id: item.id,
      lang: item.lang,
      rulesTrust: rulesAnalysis.trust,
      rulesRisk: rulesAnalysis.risk,
      rulesBand: rulesAnalysis.band,
      rulesFlags: rulesAnalysis.flags.map((f) => f.id),
      fullTrust: fullAnalysis.trust,
      fullRisk: fullAnalysis.risk,
      fullBand: fullAnalysis.band,
      aiSignals: aiHits.map((h) => ({ label: h.label, weight: h.weight })),
    });
  }

  const rulesBelow75 = results.filter((r) => r.rulesTrust < 75);
  const rulesBelow50 = results.filter((r) => r.rulesTrust < 50);
  const fullBelow75 = results.filter((r) => r.fullTrust < 75);
  const fullBelow50 = results.filter((r) => r.fullTrust < 50);

  console.log("\n======================================================================");
  console.log(`STRESS TEST V1 RESULTS (N=30 deliberately seeded genuine messages)`);
  console.log(`Live Calls Made: ${liveCalls} | Cached: ${30 - liveCalls}`);
  console.log(`Rules-Only Below 75: ${rulesBelow75.length} / 30`);
  console.log(`Rules-Only Below 50: ${rulesBelow50.length} / 30`);
  console.log(`Rules + AI Below 75: ${fullBelow75.length} / 30`);
  console.log(`Rules + AI Below 50: ${fullBelow50.length} / 30`);
  console.log("======================================================================\n");

  for (const r of results) {
    const ruleStr = r.rulesFlags.length > 0 ? r.rulesFlags.join(", ") : "none";
    const sigStr = r.aiSignals.length > 0
      ? r.aiSignals.map((s) => `${s.label} (${s.weight})`).join("; ")
      : "none";
    console.log(`- [${r.id}] [${r.lang}] Rules Trust: ${r.rulesTrust} (rules: ${ruleStr}) -> Full Trust: ${r.fullTrust} (${r.fullBand}) | AI Signals: ${sigStr}`);
  }

  const summary = {
    model: GEMINI_MODEL,
    total: 30,
    liveCalls,
    rulesOnly: {
      below75Count: rulesBelow75.length,
      below50Count: rulesBelow50.length,
      flaggedBelow75: rulesBelow75.map((r) => ({ id: r.id, trust: r.rulesTrust, flags: r.rulesFlags })),
    },
    rulesAi: {
      below75Count: fullBelow75.length,
      below50Count: fullBelow50.length,
      flaggedBelow75: fullBelow75.map((r) => ({ id: r.id, trust: r.fullTrust, aiSignals: r.aiSignals, rulesFlags: r.rulesFlags })),
    },
    results,
  };
  writeFileSync(resolve(ROOT, "eval/results/smoke-v1-full-2026-10-19.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log(`Saved results to eval/results/smoke-v1-full-2026-10-19.json`);
}

run().catch((e) => {
  console.error("Stress test v1 execution failed:", e);
  process.exit(1);
});
