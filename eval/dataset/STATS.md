# ScamShield AI — Full Dataset Distribution & Cross-Tabulations (STATS.md)

*Generated from dataset metadata only. Verbatim test texts are omitted to protect the integrity of the sealed test split.*

---

## 1. Split & Label Distribution

| Label | Dev Split (n=70) | Test Split Populated (n=40) | Test Owner Slots (n=10) | Test Total (n=50) | Overall Dataset (n=120) |
|---|---|---|---|---|---|
| **Scam** | 35 (50.0%) | 25 (62.5%) | 0 | 25 (50.0%) | 60 (50.0%) |
| **Genuine** | 35 (50.0%) | 25 (37.5%) | 10 (100.0%) | 25 (50.0%) | 60 (50.0%) |
| **Total** | 70 | 40 | 10 | 50 | 120 |

---

## 2. Scam Type by Split

| Scam Type | Dev Split (Scam n=35) | Test Split Populated (Scam n=25) | Total Scams (n=60) |
|---|---|---|---|
| `digital_arrest` | 5 | 2 | 7 |
| `fake_job` | 4 | 3 | 7 |
| `task_prepayment` | 3 | 2 | 5 |
| `investment` | 3 | 2 | 5 |
| `kyc_utility_courier` | 3 | 3 | 6 |
| `upi_collect` | 3 | 2 | 5 |
| `loan_app` | 3 | 3 | 6 |
| `voice_clone_emergency` | 4 | 2 | 6 |
| `fake_customer_care` | 4 | 2 | 6 |
| `phishing_apk` | 3 | 4 | 7 |
| **Genuine (`none`)** | 35 | 25 (+10 owner slots) | 60 |

---

## 3. Language Distribution by Split

| Language | Dev Split (n=70) | Test Split Populated (n=40) | Target (Dev) |
|---|---|---|---|
| **English (`en`)** | 28 (40.0%) | 26 (65.0%) | 28 (40.0%) |
| **Hinglish (`hinglish`)** | 23 (32.9%) | 12 (30.0%) | 23 (32.9%) |
| **Mixed Code-Switching (`mixed`)** | 19 (27.1%) | 12 (30.0%) | 19 (27.1%) |

---

## 4. Difficulty Breakdown by Label & Split

| Category | Dev Split (n=70) | Test Split Populated (n=40) |
|---|---|---|
| **Scam — Easy** | 18 | 11 |
| **Scam — Hard (Evasive / Keyword-Free)** | 17 | 14 |
| **Genuine — Easy** | 11 | 10 |
| **Genuine — Hard (Hard Negative)** | 24 | 15 |

---

## 5. Channel Distribution by Split

| Channel | Dev Split (n=70) | Test Split Populated (n=40) |
|---|---|---|
| `sms` | 29 | 21 |
| `whatsapp` | 26 | 21 |
| `email` | 12 | 6 |
| `call_transcript` | 3 | 2 |

---

## 6. Keyword-Free Scam Share

- **Dev Split Scams:** 18 / 35 (**51.4%**) are tagged `keyword_free: true` (Target: $\ge 45\%$).
- Features evasive cues without obvious rule trigger phrases (e.g. polite starter-kit purchases, balance pledges, institutional vouchers, unverified courier hold notices).

---

## 7. Hard-Negative & Hard-Scam Analysis

| Metric | Dev Split | Test Split Populated | Total Across Splits |
|---|---|---|---|
| **Hard Scams (Evasive)** | 17 / 35 (48.6%) | 14 / 25 (56.0%) | 31 / 60 |
| **Hard Negatives (Genuine)** | 24 / 35 (**68.6%**) | 15 / 25 (**60.0%**) | 39 / 50 (Target: $\ge 28$) |

### ⚠️ Distribution Divergence Warning & Owner Slot Recommendation

> **Warning:** Dev genuine hard-negative share (68.6%) and test populated genuine hard-negative share (60.0%) currently differ by **8.6 percentage points**, exceeding the 15 percentage-point parity threshold.
>
> **Remediation via 10 Owner Slots (`test-USER-01` to `10`):**
> - **Total genuine test items:** 15 (currently populated) + 10 (owner slots) = 25 genuine items.
> - **Parity target:** Dev genuine hard-negative share is 24 / 35 = 68.6%. To satisfy the $\le 15$ percentage-point parity threshold, test genuine hard-negative share must be $\ge 53.6\%$ (since $68.57\% - 15.00\% = 53.57\%$, rounded to 53.6%).
> - **Required hard negatives:** $\lceil 25 \times 0.5357 \rceil = 14$ hard negatives minimum in test.
> - **Current status:** The populated test split already provides **15** hard negatives.
> - **Owner slot quota:** The project owner must supply **at least 8 hard negatives out of their 10 inbox slots** ($14 - 6 = 8$).
> - **Resulting distribution:** Providing 8 hard negatives yields $14 / 25 = 56.0\%$ hard negatives (a gap of $12.6$ percentage points, within the 15 pp threshold). Providing 9 yields $15 / 25 = 60.0\%$ (gap of $8.6$ pp).
