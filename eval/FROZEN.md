# ScamShield Evaluation — Phase 5 Freeze Declaration

**Freeze Status:** SEALED & FROZEN  
**Date of Freeze:** 2026-10-14  
**Harness Mode:** Rules-Only Evaluation (Layer 1 Engine)  
**Dataset Split Evaluated:** `eval/dataset/dev.json` ($n=70$, 35 scam / 35 genuine)  
**Held-Out Test Split Status:** `eval/dataset/test.json` remains sealed, un-inspected, and unscored.

---

## 1. Summary of Tuning Progress

Phase 5 tuning operated under strict empirical guardrails (no live API calls, zero new false positives on the genuine dev split, at most 12 changes, 3 independent variants and 2 near-misses tested per change, regex timing $<250$ ms on 5,000 characters, and 4 original demo samples preserved within 5 points).

| Metric | Frozen Baseline (`eval/baseline_dev.json`) | dev (tuned on) (`eval/results/dev-tuned-2026-10-14.json`) | Absolute Delta |
|---|---|---|---|
| **Primary Recall (Trust < 50)** | 0 / 35 (0.0%, 95% CI: [0.0%, 9.9%]) | **3 / 35 (8.6%)** | **+8.6% (+3 detections)** |
| **Secondary Recall (Trust < 75)** | 7 / 35 (20.0%, 95% CI: [10.0%, 35.9%]) | **14 / 35 (40.0%)** | **+20.0% (2x recall, +7 detections)** |
| **False Positives (on Genuine Dev)** | 1 / 35 (2.9%) | **0 / 35 (0.0% FP, 100% specificity)** | **-1 FP (eliminated sole false alert)** |
| **ROC AUC (Risk Score)** | 0.6624 | **0.8073** | **+0.1449 (strong discrimination)** |
| **Regex Timing (5,000 characters)** | 0.143 ms | **0.187 ms** | Safe from ReDoS ($<0.2$ ms) |
| **Original 4 Demo Samples** | 20, 13, 25, 97 | **20, 13, 25, 97** | **Identical (0 points delta)** |

---

## 2. Invariants & Preservation

1. **Frozen Baseline:** `eval/baseline_dev.json` is frozen and has NOT been modified or overwritten.
2. **Tuned Results Artifact:** Saved to `eval/results/dev-tuned-2026-10-14.json`.
3. **Held-Out Test Split Invariant:** Neither `eval/dataset/test.json` nor `eval/private/owner-items.json` was opened, inspected, viewed, diffed, or evaluated during Phase 5 tuning.
4. **Generalization Disclosure:** Dev and test items were written by the same assistant; dev-tuned vocabulary may overlap with test vocabulary, so test results are likely optimistic and real-world performance is expected to be lower.
