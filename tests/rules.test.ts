import { describe, it, expect } from "vitest";
import { runRules, ruleRisk } from "@/lib/rules/engine";
import { RULES } from "@/lib/rules/lexicon";

describe("Rule Engine (lib/rules)", () => {
  it("contains exactly 18 rules", () => {
    expect(RULES).toHaveLength(18);
  });

  describe("Rule Trigger Verification (Positive matches for all 18 rules)", () => {
    const testCases: Array<{ id: string; sample: string; expectedCategory: string; expectedWeight: number }> = [
      { id: "fee", sample: "Pay Rs 499 registration fee to start working", expectedCategory: "payment", expectedWeight: 25 },
      { id: "pay-upi", sample: "Send money to payments@oksbi via UPI", expectedCategory: "payment", expectedWeight: 20 },
      { id: "transfer-demand", sample: "Please transfer Rs 10000 to the supervisor", expectedCategory: "payment", expectedWeight: 15 },
      { id: "otp", sample: "Please share your otp for verification", expectedCategory: "credential", expectedWeight: 25 },
      { id: "remote-app", sample: "Install anydesk for remote assist support", expectedCategory: "credential", expectedWeight: 25 },
      { id: "authority", sample: "This is a digital arrest warrant from CBI", expectedCategory: "authority", expectedWeight: 20 },
      { id: "kyc-threat", sample: "Notice: Your electricity disconnect tonight at 9 PM", expectedCategory: "authority", expectedWeight: 18 },
      { id: "urgency", sample: "You must complete this immediately or lose access", expectedCategory: "manipulation", expectedWeight: 15 },
      { id: "secrecy", sample: "Keep this confidential and do not share this with anyone", expectedCategory: "manipulation", expectedWeight: 12 },
      { id: "guaranteed", sample: "Join our trading channel for guaranteed profit", expectedCategory: "investment", expectedWeight: 15 },
      { id: "channel-mismatch", sample: "HR interview only on telegram group", expectedCategory: "job", expectedWeight: 15 },
      { id: "too-good-job", sample: "Earn Rs 8000 daily from home with mobile typing", expectedCategory: "job", expectedWeight: 12 },
      { id: "lottery", sample: "Congratulations you have won the lottery prize", expectedCategory: "bait", expectedWeight: 15 },
      { id: "apk", sample: "Download the banking update app.apk from the link", expectedCategory: "delivery", expectedWeight: 20 },
      { id: "shortlink", sample: "Claim your special reward at bit.ly/special-deal", expectedCategory: "delivery", expectedWeight: 12 },
      { id: "no-fee", sample: "There is no registration fee to apply for this job", expectedCategory: "legitimacy", expectedWeight: -8 },
      { id: "formal-process", sample: "Your technical interview scheduled on Thursday afternoon", expectedCategory: "legitimacy", expectedWeight: -6 },
      { id: "corporate-email", sample: "Please send your resume to recruiter@infosys.com", expectedCategory: "legitimacy", expectedWeight: -5 },
    ];

    for (const tc of testCases) {
      it(`fires rule [${tc.id}] on positive sample`, () => {
        const hits = runRules(tc.sample);
        const match = hits.find((h) => h.id === tc.id);
        expect(match, `Expected rule '${tc.id}' to fire for sample: "${tc.sample}"`).toBeDefined();
        expect(match?.category).toBe(tc.expectedCategory);
        expect(match?.weight).toBe(tc.expectedWeight);
      });
    }
  });

  describe("Negation and Near-Miss Boundaries", () => {
    it("respects negative lookbehind for 'no registration fee' (fires no-fee, NOT fee)", () => {
      const text = "Application is open. There is no registration fee required.";
      const hits = runRules(text);
      expect(hits.some((h) => h.id === "no-fee")).toBe(true);
      expect(hits.some((h) => h.id === "fee")).toBe(false);
    });

    it("respects negative lookbehind for 'no processing fee' (fires no-fee, NOT fee)", () => {
      const text = "Free recruitment drive with no processing fee charged.";
      const hits = runRules(text);
      expect(hits.some((h) => h.id === "no-fee")).toBe(true);
      expect(hits.some((h) => h.id === "fee")).toBe(false);
    });

    it("does not match corporate-email for freemail domains (gmail, yahoo, outlook, hotmail, rediffmail)", () => {
      const text = "Contact our coordinator at recruiter@gmail.com and hr@yahoo.com and admin@outlook.com";
      const hits = runRules(text);
      expect(hits.some((h) => h.id === "corporate-email")).toBe(false);
    });

    it("matches corporate-email for corporate domains", () => {
      const text = "Send your CV to careers@tcs.com";
      const hits = runRules(text);
      expect(hits.some((h) => h.id === "corporate-email")).toBe(true);
    });

    describe("Bounded Negation Guard (otp and fee)", () => {
      it("does not hit otp on 'do not share your OTP'", () => {
        const hits = runRules("do not share your OTP");
        expect(hits.some((h) => h.id === "otp")).toBe(false);
      });

      it("hits otp on 'share your OTP now'", () => {
        const hits = runRules("share your OTP now");
        expect(hits.some((h) => h.id === "otp")).toBe(true);
      });

      it("does not hit fee on 'we never charge any registration fee'", () => {
        const hits = runRules("we never charge any registration fee");
        expect(hits.some((h) => h.id === "fee")).toBe(false);
      });

      it("hits fee on 'pay the registration fee'", () => {
        const hits = runRules("pay the registration fee");
        expect(hits.some((h) => h.id === "fee")).toBe(true);
      });

      it("does not hit otp on 'OTP kisi se share mat karna'", () => {
        const hits = runRules("OTP kisi se share mat karna");
        expect(hits.some((h) => h.id === "otp")).toBe(false);
      });

      it("hits otp on 'OTP batao'", () => {
        const hits = runRules("OTP batao");
        expect(hits.some((h) => h.id === "otp")).toBe(true);
      });
    });
  });

  describe("Scoring & Determinism", () => {
    it("ruleRisk correctly sums weights of hits", () => {
      const text = "Pay registration fee Rs 500 immediately to payments@oksbi";
      const hits = runRules(text);
      const risk = ruleRisk(hits);
      const expectedSum = hits.reduce((s, h) => s + h.weight, 0);
      expect(risk).toBe(expectedSum);
    });

    it("produces identical results over 50 iterations (pure & deterministic)", () => {
      const text = "CBI officer: digital arrest warrant issued. Pay Rs 50000 immediately to officer@oksbi or face detention.";
      const first = runRules(text);
      for (let i = 0; i < 50; i++) {
        const next = runRules(text);
        expect(next).toEqual(first);
      }
    });
  });

  describe("ReDoS Security Guard", () => {
    it("runs within 250ms on a 5,000-character adversarial string", () => {
      // String with deep repeating whitespace and alphanumeric sequences designed to trigger catastrophic backtracking
      const adversarial = "urgent ".repeat(500) + "a ".repeat(600) + "https://" + "x".repeat(1200) + ".test";
      expect(adversarial.length).toBeGreaterThanOrEqual(5000);

      const start = performance.now();
      const hits = runRules(adversarial.slice(0, 5000));
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(250);
      expect(Array.isArray(hits)).toBe(true);
    });
  });
});
