# ScamShield AI — Locked Held-Out Test Evaluation (Rules-Only)

**Evaluation Date**: 2026-10-14  
**Split**: Sealed Held-Out Test Set (`eval/dataset/test.json`)  
**Test Checksum**: `409b0a0cc207a55b922c39249d951ea0dd56ec8bd51b7cdcb0f1b5633874290c`  
**Total Items Evaluated**: 50 (25 Scam / 25 Genuine, including 10 Owner Slots)  
**Mode**: Pure Rules Engine (`lib/rules/engine.ts`, deterministic, zero LLM calls)  

---

## 1. Metric Comparison Across Splits

| Metric | Baseline dev (frozen) | Tuned dev (frozen) | Sealed test (held-out) |
| :--- | :--- | :--- | :--- |
| **Recall @ Trust < 50** | 0/35 (0.0%) [0.0%, 9.9%] | 3/35 (8.6%) [2.2%, 22.8%] | **0/25 (0.0%) [0.0%, 13.3%]** |
| **Recall @ Trust < 75** | 7/35 (20.0%) [10.0%, 35.9%] | 14/35 (40.0%) [25.7%, 56.4%] | **9/25 (36.0%) [20.2%, 55.5%]** |
| **False-positive rate @ Trust < 50** | 1/35 (2.9%) [0.5%, 14.5%] | 0/35 (0.0%) [0.0%, 9.9%] | **3/25 (12.0%) [4.2%, 30.0%]** |
| **False-positive rate @ Trust < 75** | 1/35 (2.9%) [0.5%, 14.5%] | 0/35 (0.0%) [0.0%, 9.9%] | **4/25 (16.0%) [6.4%, 34.7%]** |
| **Precision @ Trust < 50** *(precision on a balanced set is not real-world precision)* | 0.0% (0/1) [0.0%, 79.3%] *(precision on a balanced set is not real-world precision)* | 100.0% (3/3) [43.8%, 100.0%] *(precision on a balanced set is not real-world precision)* | **0.0% (0/3) [0.0%, 56.2%] *(precision on a balanced set is not real-world precision)*** |
| **Precision @ Trust < 75** *(precision on a balanced set is not real-world precision)* | 87.5% (7/8) [52.9%, 97.8%] *(precision on a balanced set is not real-world precision)* | 100.0% (14/14) [78.5%, 100.0%] *(precision on a balanced set is not real-world precision)* | **69.2% (9/13) [42.4%, 87.3%] *(precision on a balanced set is not real-world precision)*** |
| **Specificity @ Trust < 50** | 97.1% (34/35) [85.5%, 99.5%] | 100.0% (35/35) [90.1%, 100.0%] | **88.0% (22/25) [70.0%, 95.8%]** |
| **Specificity @ Trust < 75** | 97.1% (34/35) [85.5%, 99.5%] | 100.0% (35/35) [90.1%, 100.0%] | **84.0% (21/25) [65.3%, 93.6%]** |
| **Accuracy @ Trust < 50** | 48.6% (34/70) [37.2%, 60.0%] | 54.3% (38/70) [42.6%, 65.5%] | **44.0% (22/50) [31.2%, 57.7%]** |
| **Accuracy @ Trust < 75** | 58.6% (41/70) [46.9%, 69.4%] | 70.0% (49/70) [58.5%, 79.5%] | **60.0% (30/50) [46.2%, 72.4%]** |
| **ROC AUC** | 0.6624 | 0.8073 [0.7081, 0.8936] | **0.6704 [0.5256, 0.8084]** |
| **Latency p50 / p95** | 0.14 ms / 0.18 ms | 0.18 ms / 0.22 ms | **0.05 ms / 1.35 ms** |

*All bracketed intervals for proportions are Wilson 95% score confidence intervals. ROC AUC 95% confidence intervals are empirical bootstrap intervals over 1,000 resamples with fixed seed 42.*

---

## 2. Dev-to-Test Gap Analysis & Retraction of Overfitting Finding

> **Labelled Correction Note (Post-Hoc Label Correction)**:  
> Owner items `test-USER-01` through `test-USER-08` were mislabeled as genuine at fill time because `fill-owner-slots.ts` assigned `"genuine"` to all owner slots without inspecting the input file; the owner's private file documents these 8 items as scams (see `eval/dataset/test.label-corrections.json`).  
> 
> Under the corrected ground truth labels (33 scam / 17 genuine), rules-only test ROC AUC is **0.8458 [0.7456, 0.9317]** compared to tuned dev **0.8073 [0.7081, 0.8936]**.  
> **Overfitting can be neither confirmed nor excluded** because the 8 owner scams were written with knowledge of the rules. The earlier hypothesis that the rules overfit dev vocabulary is retracted.

### Corrected Rules-Only Evaluation Table (33 Scam / 17 Genuine)

| Metric | Untuned Baseline (dev) | Tuned Rules (dev) | Sealed Test (25/25) | Corrected Test (33/17) |
| :--- | :--- | :--- | :--- | :--- |
| **Recall @ Trust < 50** | 0.0% (0/35) | 8.6% (3/35) [2.2%, 22.8%] | 0.0% (0/25) [0.0%, 13.3%] | **9.1% (3/33) [3.1%, 23.6%]** |
| **Recall @ Trust < 75** | 0.0% (0/35) | 40.0% (14/35) [25.7%, 56.4%] | 36.0% (9/25) [20.2%, 55.5%] | **39.4% (13/33) [24.7%, 56.3%]** |
| **False-Positive Rate (<50)** | 0.0% (0/35) | 0.0% (0/35) [0.0%, 9.9%] | 12.0% (3/25) [4.2%, 30.0%] | **0.0% (0/17) [0.0%, 18.4%]** |
| **False-Positive Rate (<75)** | 0.0% (0/35) | 0.0% (0/35) [0.0%, 9.9%] | 16.0% (4/25) [6.4%, 34.7%] | **0.0% (0/17) [0.0%, 18.4%]** |
| **Precision @ Trust < 50** | 0.0% | 100.0% [43.8%, 100.0%] | 0.0% [0.0%, 56.2%] | **100.0% [43.8%, 100.0%]** *(precision on a balanced set is not real-world precision)* |
| **Precision @ Trust < 75** | 0.0% | 100.0% [78.5%, 100.0%] | 69.2% [42.4%, 87.3%] | **100.0% [77.2%, 100.0%]** *(precision on a balanced set is not real-world precision)* |
| **Specificity @ Trust < 50** | 97.1% (34/35) | 100.0% (35/35) | 88.0% (22/25) | **100.0% (17/17) [81.6%, 100.0%]** |
| **Specificity @ Trust < 75** | 97.1% (34/35) | 100.0% (35/35) | 84.0% (21/25) | **100.0% (17/17) [81.6%, 100.0%]** |
| **ROC AUC** | 0.6624 | 0.8073 [0.7081, 0.8936] | 0.6704 [0.5256, 0.8084] | **0.8458 [0.7456, 0.9317]** |

- Recall @ Trust < 50: tuned dev 8.6% [2.2%, 22.8%] vs corrected test 9.1% [3.1%, 23.6%].
- Recall @ Trust < 75: tuned dev 40.0% [25.7%, 56.4%] vs corrected test 39.4% [24.7%, 56.3%].
- ROC AUC: tuned dev 0.8073 [0.7081, 0.8936] vs corrected test 0.8458 [0.7456, 0.9317] (1,000 bootstrap resamples, seed 42).

---

## 3. Subgroup Breakdowns on Sealed Test Split

### Breakdown by Scam Type
| Category | Scams (Rec <50) | Scams (Rec <75) | Genuine (FP <50) | Genuine (FP <75) |
| :--- | :--- | :--- | :--- | :--- |
| digital_arrest | 0/2 (0.0%) | 1/2 (50.0%) | N/A | N/A |
| fake_job | 0/3 (0.0%) | 2/3 (66.7%) | N/A | N/A |
| task_prepayment | 0/2 (0.0%) | 0/2 (0.0%) | N/A | N/A |
| investment | 0/2 (0.0%) | 1/2 (50.0%) | N/A | N/A |
| kyc_utility_courier | 0/3 (0.0%) | 2/3 (66.7%) | N/A | N/A |
| upi_collect | 0/2 (0.0%) | 0/2 (0.0%) | N/A | N/A |
| loan_app | 0/3 (0.0%) | 1/3 (33.3%) | N/A | N/A |
| voice_clone_emergency | 0/2 (0.0%) | 2/2 (100.0%) | N/A | N/A |
| fake_customer_care | 0/2 (0.0%) | 0/2 (0.0%) | N/A | N/A |
| phishing_apk | 0/4 (0.0%) | 0/4 (0.0%) | N/A | N/A |
| none | N/A | N/A | 3/25 (12.0%) | 4/25 (16.0%) |

### Breakdown by Language
| Category | Scams (Rec <50) | Scams (Rec <75) | Genuine (FP <50) | Genuine (FP <75) |
| :--- | :--- | :--- | :--- | :--- |
| en | 0/15 (0.0%) | 4/15 (26.7%) | 0/11 (0.0%) | 1/11 (9.1%) |
| hinglish | 0/3 (0.0%) | 2/3 (66.7%) | 2/9 (22.2%) | 2/9 (22.2%) |
| mixed | 0/7 (0.0%) | 3/7 (42.9%) | 1/5 (20.0%) | 1/5 (20.0%) |

*Note: Only 3 test scams are Hinglish, so per-language scam recall is not interpretable.*

### Note on Owner-Written Items
Owner items `test-USER-01` through `test-USER-08` were mislabeled as genuine at fill time; see `eval/dataset/test.label-corrections.json`. Under the corrected ground truth, the genuine test split contains 17 items (`test-026`..`test-040`, `test-USER-09`, `test-USER-10`) with 0 false positives at either threshold.

### Breakdown by Difficulty
| Category | Scams (Rec <50) | Scams (Rec <75) | Genuine (FP <50) | Genuine (FP <75) |
| :--- | :--- | :--- | :--- | :--- |
| easy | 0/11 (0.0%) | 5/11 (45.5%) | 0/10 (0.0%) | 0/10 (0.0%) |
| hard | 0/14 (0.0%) | 4/14 (28.6%) | 3/15 (20.0%) | 4/15 (26.7%) |

### Breakdown by Channel
| Category | Scams (Rec <50) | Scams (Rec <75) | Genuine (FP <50) | Genuine (FP <75) |
| :--- | :--- | :--- | :--- | :--- |
| whatsapp | 0/12 (0.0%) | 4/12 (33.3%) | 2/9 (22.2%) | 2/9 (22.2%) |
| call_transcript | 0/2 (0.0%) | 1/2 (50.0%) | N/A | N/A |
| sms | 0/9 (0.0%) | 4/9 (44.4%) | 1/12 (8.3%) | 1/12 (8.3%) |
| email | 0/2 (0.0%) | 0/2 (0.0%) | 0/4 (0.0%) | 1/4 (25.0%) |

---

## 4. Error Analysis & Diagnostics (ID, Rule IDs, and Cause Category Only)

### False Positives @ Trust < 50 (n=3)
Genuine messages flagged as scam (Trust < 50):

| ID | True Label | Pred Trust | Pred Band | Fired Rule IDs | Cause Category |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `test-USER-01` | `genuine` | 48 | `high_risk` | `pay-upi, authority, secrecy` | Multiple high-weight rule confluence (`pay-upi` + `authority` + `secrecy`) |
| `test-USER-02` | `genuine` | 25 | `high_risk` | `fee, pay-upi, urgency, guaranteed` | 4-rule pattern match (`fee` + `pay-upi` + `urgency` + `guaranteed`) |
| `test-USER-04` | `genuine` | 40 | `high_risk` | `fee, pay-upi, guaranteed` | 3-rule pattern match (`fee` + `pay-upi` + `guaranteed`) |

### Genuine Items Flagged Below 75 Trust (n=4)
Genuine messages flagged with caution/suspicious or high-risk:

| ID | True Label | Pred Trust | Pred Band | Fired Rule IDs | Cause Category |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `test-USER-01` | `genuine` | 48 | `high_risk` | `pay-upi, authority, secrecy` | Fired 3 rules (risk 52) |
| `test-USER-02` | `genuine` | 25 | `high_risk` | `fee, pay-upi, urgency, guaranteed` | Fired 4 rules (risk 75) |
| `test-USER-04` | `genuine` | 40 | `high_risk` | `fee, pay-upi, guaranteed` | Fired 3 rules (risk 60) |
| `test-USER-08` | `genuine` | 71 | `suspicious` | `pay-upi, urgency, formal-process` | Fired `pay-upi` (+20) + `urgency` (+15) with `formal-process` (-6) (net risk 29) |

### Single-Rule Scams (n=9)
Scams firing exactly one rule (insufficient risk accumulation for Trust < 50):

| ID | Scam Type | Pred Trust | Pred Band | Single Fired Rule ID | Weight |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `test-001` | `digital_arrest` | 80 | `safe` | `authority` | 20 |
| `test-012` | `upi_collect` | 80 | `safe` | `pay-upi` | 20 |
| `test-015` | `loan_app` | 85 | `safe` | `urgency` | 15 |
| `test-019` | `fake_customer_care` | 75 | `safe` | `remote-app` | 25 |
| `test-020` | `phishing_apk` | 85 | `safe` | `urgency` | 15 |
| `test-021` | `phishing_apk` | 85 | `safe` | `urgency` | 15 |
| `test-022` | `phishing_apk` | 80 | `safe` | `authority` | 20 |
| `test-023` | `phishing_apk` | 80 | `safe` | `apk` | 20 |
| `test-025` | `loan_app` | 85 | `safe` | `urgency` | 15 |

### Zero-Rule Scams (n=7)
Scams firing zero rules (Trust = 97, completely undetected by pure regex):
- `test-004` (fake_job)
- `test-006` (task_prepayment)
- `test-007` (task_prepayment)
- `test-009` (investment)
- `test-013` (upi_collect)
- `test-018` (fake_customer_care)
- `test-024` (kyc_utility_courier)

### Multi-Rule Scams (n=9)
Scams firing 2 or more rules (all 9 detected at Trust < 75, but none reached Trust < 50):
- `test-002` (digital_arrest): Trust 67, rules: `kyc-threat, urgency`
- `test-003` (fake_job): Trust 55, rules: `fee, pay-upi`
- `test-005` (fake_job): Trust 73, rules: `channel-mismatch, too-good-job`
- `test-008` (investment): Trust 65, rules: `pay-upi, guaranteed`
- `test-010` (kyc_utility_courier): Trust 67, rules: `kyc-threat, urgency`
- `test-011` (kyc_utility_courier): Trust 62, rules: `authority, kyc-threat`
- `test-014` (loan_app): Trust 65, rules: `apk, urgency`
- `test-016` (voice_clone_emergency): Trust 65, rules: `pay-upi, urgency`
- `test-017` (voice_clone_emergency): Trust 73, rules: `urgency, secrecy`
