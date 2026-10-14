# ScamShield AI — Locked Held-Out Test Evaluation (Rules-Only)

**Evaluation Date**: 2026-10-14  
**Split**: Sealed Held-Out Test Set (`eval/dataset/test.json`)  
**Test Checksum**: `409b0a0cc207a55b922c39249d951ea0dd56ec8bd51b7cdcb0f1b5633874290c`  
**Total Items Evaluated**: 50 (25 Scam / 25 Genuine, including 10 Owner Slots)  
**Mode**: Pure Rules Engine (`lib/rules/engine.ts`, deterministic, zero LLM calls)  

## 1. Metric Comparison Across Splits

| Metric | Baseline dev (frozen) | Tuned dev (frozen) | Sealed test (held-out) |
| :--- | :--- | :--- | :--- |
| **Recall @ Trust < 50** | 0/35 (0.0%) | 3/35 (8.6%) | 0/25 (0%) |
| **Recall @ Trust < 75** | 7/35 (20.0%) | 14/35 (40.0%) | 9/25 (36%) |
| **False-positive rate** | 1/35 (2.9%) | 0/35 (0.0%) | 3/25 (12.0%) |
| **ROC AUC** | 0.6624 | 0.8073 | 0.6704 |
| **Latency p50 / p95** | 0.14 ms / 0.18 ms | 0.18 ms / 0.22 ms | 0.05 ms / 1.35 ms |

## 2. Test Error Breakdown (Zero-Leakage)

### False Positives (Genuine messages flagged as scam at Trust < 50, n=3)

| ID | True Label | Pred Trust | Pred Band | Fired Rules |
| :--- | :--- | :--- | :--- | :--- |
| `test-USER-01` | `genuine` | 48 | `high_risk` | `pay-upi, authority, secrecy` |
| `test-USER-02` | `genuine` | 25 | `high_risk` | `fee, pay-upi, urgency, guaranteed` |
| `test-USER-04` | `genuine` | 40 | `high_risk` | `fee, pay-upi, guaranteed` |

### False Negatives (Scams missed as genuine at Trust < 50, n=25)

| ID | Scam Type | True Label | Pred Trust | Pred Band | Fired Rules |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `test-001` | `digital_arrest` | `scam` | 80 | `safe` | `authority` |
| `test-002` | `digital_arrest` | `scam` | 67 | `suspicious` | `kyc-threat, urgency` |
| `test-003` | `fake_job` | `scam` | 55 | `suspicious` | `fee, pay-upi` |
| `test-004` | `fake_job` | `scam` | 97 | `safe` | `none` |
| `test-005` | `fake_job` | `scam` | 73 | `suspicious` | `channel-mismatch, too-good-job` |
| `test-006` | `task_prepayment` | `scam` | 97 | `safe` | `none` |
| `test-007` | `task_prepayment` | `scam` | 97 | `safe` | `none` |
| `test-008` | `investment` | `scam` | 65 | `suspicious` | `pay-upi, guaranteed` |
| `test-009` | `investment` | `scam` | 97 | `safe` | `none` |
| `test-010` | `kyc_utility_courier` | `scam` | 67 | `suspicious` | `kyc-threat, urgency` |
| `test-011` | `kyc_utility_courier` | `scam` | 62 | `suspicious` | `authority, kyc-threat` |
| `test-012` | `upi_collect` | `scam` | 80 | `safe` | `pay-upi` |
| `test-013` | `upi_collect` | `scam` | 97 | `safe` | `none` |
| `test-014` | `loan_app` | `scam` | 65 | `suspicious` | `apk, urgency` |
| `test-015` | `loan_app` | `scam` | 85 | `safe` | `urgency` |
| `test-016` | `voice_clone_emergency` | `scam` | 65 | `suspicious` | `pay-upi, urgency` |
| `test-017` | `voice_clone_emergency` | `scam` | 73 | `suspicious` | `urgency, secrecy` |
| `test-018` | `fake_customer_care` | `scam` | 97 | `safe` | `none` |
| `test-019` | `fake_customer_care` | `scam` | 75 | `safe` | `remote-app` |
| `test-020` | `phishing_apk` | `scam` | 85 | `safe` | `urgency` |
| `test-021` | `phishing_apk` | `scam` | 85 | `safe` | `urgency` |
| `test-022` | `phishing_apk` | `scam` | 80 | `safe` | `authority` |
| `test-023` | `phishing_apk` | `scam` | 80 | `safe` | `apk` |
| `test-024` | `kyc_utility_courier` | `scam` | 97 | `safe` | `none` |
| `test-025` | `loan_app` | `scam` | 85 | `safe` | `urgency` |
