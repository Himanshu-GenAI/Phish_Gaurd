import { NextRequest, NextResponse } from "next/server";
import { runRules } from "@/lib/rules/engine";
import { extractUrls } from "@/lib/checks/entities";
import { checkDomain, DomainCheck } from "@/lib/checks/rdap";
import {
  analyzeWithGemini,
  analyzeAudioWithGemini,
  geminiSignalsToHits,
  GeminiResult,
  GeminiServiceError,
} from "@/lib/ai/gemini";
import type { RuleHit } from "@/lib/rules/types";
import { validateText, validateAudio, shouldTriggerNoSpeech } from "@/lib/validation";
import { analyzeText } from "@/lib/analyze/pipeline";

// Maximum duration for Vercel serverless function: 30 seconds provides
// ample headroom for parallel 10s Gemini and 6s RDAP timeouts plus serialization.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const startTime = performance.now();

  // 1. Parse body in its own try/catch (400 for malformed JSON)
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const rawText = typeof body?.text === "string" ? body.text : undefined;
  const rawAudio = typeof body?.audio === "string" ? body.audio : undefined;
  const rawMime = typeof body?.mimeType === "string" ? body.mimeType : undefined;

  // Reject when neither audio nor text is provided
  if (!rawAudio && (!rawText || !rawText.trim())) {
    return NextResponse.json({ error: "Nothing to analyze" }, { status: 400 });
  }

  // ── Audio branch ──────────────────────────────────────────
  if (rawAudio) {
    const valAudio = validateAudio(rawAudio, rawMime);
    if (!valAudio.valid) {
      return NextResponse.json(
        { error: valAudio.error },
        { status: valAudio.status ?? 400 }
      );
    }

    let aiResult: GeminiResult | null = null;
    try {
      aiResult = await analyzeAudioWithGemini(valAudio.cleanBase64!, valAudio.targetMime!);
    } catch (err) {
      if (err instanceof GeminiServiceError && (err.status === 429 || err.status === 503)) {
        console.warn(`[analyze:audio] Voice service busy (${err.status})`);
        return NextResponse.json(
          { error: "The voice service is busy or at its limit. Please try again later." },
          { status: 503 }
        );
      }
      console.warn("[analyze:audio] Audio analysis error");
    }

    if (!aiResult) {
      return NextResponse.json(
        { error: "Audio analysis failed. Try pasting the text instead." },
        { status: 502 }
      );
    }

    const transcript = (aiResult.transcript || "").trim();

    // Speech guard: triggers only when speech_detected is false OR transcript has fewer than 5 Unicode letters
    if (shouldTriggerNoSpeech({ speech_detected: aiResult.speech_detected, transcript })) {
      return NextResponse.json({
        noSpeech: true,
        message: "No intelligible speech detected in the audio file.",
        transcript: "",
        trust: null,
        band: null,
        scam_type: "none",
        flags: [],
        verdict: "No intelligible speech detected in the audio file.",
        next_steps: [],
        family_note: "",
        degraded: [],
        entities: { upi: [], amounts: [] },
        breakdown: {
          rules: 0,
          rdap: 0,
          ai: 0,
          raw_risk: 0,
          risk: 0,
          degraded: [],
        },
      });
    }

    const degraded: string[] = [];

    // Cap the audio transcript at 5,000 characters for analysis (rules, entity extraction, RDAP)
    // so regex matching execution time remains strictly bounded, while keeping full transcript for display.
    const textForAnalysis = transcript.slice(0, 5000);
    const urls = extractUrls(textForAnalysis).slice(0, 3);

    // RDAP domain checks with degradation tracking
    let domainResults: DomainCheck[] = [];
    try {
      const rdapSettled = await Promise.allSettled(urls.map((u) => checkDomain(u)));
      domainResults = rdapSettled
        .filter((r): r is PromiseFulfilledResult<DomainCheck | null> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((d): d is DomainCheck => d !== null);

      if (urls.length > 0 && rdapSettled.some((r) => r.status === "rejected")) {
        degraded.push("domain-check");
      }
    } catch {
      degraded.push("domain-check");
    }

    const aiHits: RuleHit[] = geminiSignalsToHits(aiResult.ai_signals);
    const analysis = analyzeText(textForAnalysis, { domainResults, aiHits, degraded });

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[analyze:audio] 200 OK | duration: ${elapsed}ms | flags: ${analysis.flags.length}`);

    return NextResponse.json({
      trust: analysis.trust,
      band: analysis.band,
      scam_type: aiResult.scam_type ?? "unknown",
      flags: analysis.flags,
      verdict: aiResult.verdict ?? "Analysis complete.",
      next_steps: aiResult.next_steps ?? [
        "Verify the sender through official channels before acting.",
        "Never pay any fee to receive a job, prize, or refund.",
        "Report scams: call 1930 or visit cybercrime.gov.in",
      ],
      family_note: aiResult.family_note ?? "",
      transcript,
      degraded: analysis.breakdown.degraded,
      entities: { upi: analysis.entities.upi, amounts: analysis.entities.amounts },
      breakdown: {
        rules: analysis.breakdown.rules,
        rdap: analysis.breakdown.rdap,
        ai: analysis.breakdown.ai,
        raw_risk: analysis.breakdown.raw_risk,
        risk: analysis.breakdown.risk,
        degraded: analysis.breakdown.degraded,
      },
    });
  }

  // ── Text branch ───────────────────────────────────────────
  const valText = validateText(rawText);
  if (!valText.valid) {
    return NextResponse.json(
      { error: valText.error },
      { status: valText.status ?? 400 }
    );
  }
  const text = valText.text!;

  // Layer 1 preview for Gemini prompt
  let previewHits: RuleHit[] = [];
  try {
    previewHits = runRules(text);
  } catch {
    previewHits = [];
  }

  const urls = extractUrls(text).slice(0, 3);
  const degraded: string[] = [];

  // Parallel Layer 2 (RDAP) and Layer 3 (Gemini) via Promise.allSettled
  const [rdapSettled, geminiSettled] = await Promise.allSettled([
    Promise.all(urls.map((u) => checkDomain(u))),
    analyzeWithGemini(
      text,
      previewHits.map((h) => h.label)
    ),
  ]);

  let domainResults: DomainCheck[] = [];
  if (rdapSettled.status === "fulfilled") {
    domainResults = rdapSettled.value.filter((d): d is DomainCheck => d !== null);
  } else {
    degraded.push("domain-check");
  }

  let ai: GeminiResult | null = null;
  if (geminiSettled.status === "fulfilled" && geminiSettled.value !== null) {
    ai = geminiSettled.value;
  } else {
    degraded.push("ai-analysis");
  }

  const aiHits: RuleHit[] = ai ? geminiSignalsToHits(ai.ai_signals) : [];
  const analysis = analyzeText(text, { domainResults, aiHits, degraded });

  const scam_type = ai?.scam_type ?? "unknown";
  const verdict =
    ai?.verdict ?? "Rule-based analysis only (AI layer unavailable).";
  const next_steps = ai?.next_steps ?? [
    "Verify the sender through official channels before acting.",
    "Never pay any fee to receive a job, prize, or refund.",
    "Report scams: call 1930 or visit cybercrime.gov.in",
  ];
  const family_note = ai?.family_note ?? "";

  const elapsed = Math.round(performance.now() - startTime);
  console.log(
    `[analyze:text] 200 OK | duration: ${elapsed}ms | degraded: [${degraded.join(", ")}]`
  );

  return NextResponse.json({
    trust: analysis.trust,
    band: analysis.band,
    scam_type,
    flags: analysis.flags,
    verdict,
    next_steps,
    family_note,
    transcript: "",
    degraded: analysis.breakdown.degraded,
    entities: { upi: analysis.entities.upi, amounts: analysis.entities.amounts },
    breakdown: {
      rules: analysis.breakdown.rules,
      rdap: analysis.breakdown.rdap,
      ai: analysis.breakdown.ai,
      raw_risk: analysis.breakdown.raw_risk,
      risk: analysis.breakdown.risk,
      degraded: analysis.breakdown.degraded,
    },
  });
}
