# Evaluation Dataset & Methodology Notes

## Overview & Composition

This directory contains the evaluation datasets for ScamShield AI:
- `dev.json`: Development split (70 items: 35 scam, 35 genuine). Used for baseline metrics and guided rule tuning.
- `test.json`: Sealed held-out test split (50 items: 25 scam, 15 genuine, plus 10 reserved user slots that will all be genuine, creating a balanced 25 scam / 25 genuine split; 60 scam / 60 genuine overall). Used solely for the final evaluation run.
- `real_redacted.template.json`: Template with 10 slots for real-world spam/inbox samples added by the project owner.

## Independence & Methodology Disclosure

- **Synthetic & Self-Labeled:** This dataset is synthetically authored and labeled by the same AI system that inspected the rule engine architecture. While blind authoring principles were followed during generation (no scoring code was run and no lexicon patterns were viewed during writing), this shared origin means that performance metrics on this corpus are likely optimistic compared to wild in-the-wild distributions. Dev and test items were written by the same assistant; dev-tuned vocabulary may overlap with test vocabulary, so test results are likely optimistic and real-world performance is expected to be lower.
- **Sealed Test Split vs. Independent Authorship:** The held-out `test.json` split is sealed from tuning (no rules may be modified based on errors seen in `test.json`), but it was not authored by an independent third party.
- **Prevalence & Precision Limitations:** The dataset is intentionally balanced (50% scam, 50% genuine) to ensure statistical sample size across both classes. In real-world messaging inboxes, genuine messages vastly outnumber scams (real-world scam prevalence is typically well below 5%). Therefore, positive predictive value (precision) measured on this 50/50 dataset will not match real-world inbox precision without Bayesian prevalence adjustment.

## Hard Scams and Realism

At least 40% of scam samples omit obvious rule keywords (such as "registration fee" or "OTP"). Real-world fraud patterns include:
- Polite recruiter language asking to purchase "starter kits" or gift cards.
- Task scams that avoid fee terminology entirely.
- Vague parcel hold notices instructing victims to call an unverified number.
- Relatives requesting emergency medical support without stating numerical amounts.
- Reverse UPI collect / QR traps ("Scan to receive funds").
- Aggressive micro-lending threats targeting phone contacts.

Hard negatives include:
- Legitimate bank alerts emphasizing "never share OTP".
- Real UPI transaction debit confirmations.
- Formal recruiter interview invitations with salary disclosures.
- College semester exam fee notices.
- Food delivery and ecommerce one-time verification codes.
- Utility bill deadlines.

## Privacy & Redaction

All items use fictional entities. No real individual names, phone numbers, Aadhaar numbers, bank account numbers, or private UPI handles are used. URL tests use `.test` top-level domains.
