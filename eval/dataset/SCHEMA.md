# ScamShield AI — Dataset Schema

Each dataset item in `dev.json` and `test.json` adheres to the following JSON schema:

```json
{
  "id": "string (unique item identifier, e.g. dev-001 or test-001)",
  "text": "string (message content to analyze; empty string only for unpopulated owner slots)",
  "label": "scam" | "genuine",
  "scam_type": "digital_arrest" | "fake_job" | "task_prepayment" | "investment" | "kyc_utility_courier" | "upi_collect" | "loan_app" | "voice_clone_emergency" | "fake_customer_care" | "phishing_apk" | "none",
  "language": "en" | "hinglish" | "mixed",
  "difficulty": "easy" | "hard",
  "source": "synthetic" | "real_redacted",
  "channel": "sms" | "whatsapp" | "email" | "call_transcript",
  "keyword_free": "boolean (optional, tagged on scam items: true when message omits obvious fee/OTP/arrest keywords)",
  "notes": "string (context, rationale, or special flags like 'adversarial')"
}
```

## Field Specifications

- **id**: Unique identifier prefixed by split (`dev-XXX` or `test-XXX`). The 10 reserved owner slots are `test-USER-01` through `test-USER-10`.
- **text**: Verbatim message content. Fictional entities only. No real phone numbers, Aadhaar numbers, bank account numbers, or personal UPI handles. Empty string only for unpopulated owner slots.
- **label**: Ground truth binary classification: `"scam"` or `"genuine"`. Owner slots are all `"genuine"` (10 real-world inbox samples added by project owner, completing the 25 scam / 25 genuine test split).
- **scam_type**: Fraud category for scam items, or `"none"` for genuine items (including owner slots).
- **language**:
  - `"en"`: English.
  - `"hinglish"`: Hindi in Latin script (e.g., *"Aapka electricity connection kat jayega"*).
  - `"mixed"`: English mixed with romanized Hindi phrases.
- **difficulty**:
  - `"easy"`: Typical patterns with straightforward cues.
  - `"hard"`: Subtle scams missing standard buzzwords (polite phrasing, gift card requests, QR receive traps) OR hard negatives (legitimate bank OTP alerts, college fee reminders, utility bill deadlines).
- **source**: `"synthetic"` (curated based on known fraud forensics) or `"real_redacted"` (real-world messages with sensitive identifiers anonymized).
- **channel**: Messaging medium (`"sms"`, `"whatsapp"`, `"email"`, `"call_transcript"`).
- **keyword_free**: Boolean tag on scam items indicating absence of explicit fee, OTP, or arrest trigger words.
- **notes**: Explains inclusion reason. Items with prompt injections are explicitly marked `"adversarial"` here. Owner slots are marked `"to be written by the project owner"`.
