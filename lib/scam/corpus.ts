/**
 * Scam Pattern Library — synthetic test corpus authored from documented Indian
 * scam patterns (NCRP / I4C advisories, media reporting). 8 scam types +
 * 2 deliberate genuine controls (one easy, one hard negative for the OTP rule).
 */

export type Channel = "whatsapp" | "sms" | "email";

export interface CorpusEntry {
  id: string;
  scamType: string;
  channel: Channel;
  language: string;
  difficulty: "hard" | "easy";
  referenceTrust: number;
  signals: string;
  text: string;
}

export const CORPUS: CorpusEntry[] = [
  {
    id: "digital-arrest",
    scamType: "Digital Arrest",
    channel: "whatsapp",
    language: "Hinglish",
    difficulty: "hard",
    referenceTrust: 18,
    signals: "Authority + urgency + secrecy + payment demand",
    text: "Namaste, main Mumbai Cyber Cell ka Inspector Rajesh Verma bol raha hoon. Aapke Aadhaar number se illegal money laundering case mein involvement mili hai, case number CC-2024-8891. Aapki immediate arrest ho sakti hai, lekin Supreme Court ke naye guidelines ke hisaab se hum aapko verification ka mauka de rahe hain. Digital arrest se bachne ke liye 30 minute ke andar ₹2,40,000 RBI verification account mein transfer karein: rbi-verify@icici. Ye confidential investigation hai — na bank ko batana, na family ko, warna arrest warrant issue ho jayegi.",
  },
  {
    id: "fake-internship",
    scamType: "Fake Job / Internship",
    channel: "sms",
    language: "Hinglish",
    difficulty: "hard",
    referenceTrust: 13,
    signals: "Fee + personal UPI + Telegram-only HR + salary mismatch",
    text: "CONGRATULATIONS! Aap Amazon ke WFH part-time job ke liye select ho gaye hain. Daily income ₹3,000-5,000, no interview, no resume. Aaj hi ₹499 registration fee UPI se pay karein: amazon-hr@ybl. Sirf 2 slots left, offer aaj raat tak valid hai. HR ko sirf Telegram par contact karein: @amazon_wfh_hr_bot.",
  },
  {
    id: "task-prepayment",
    scamType: "Task / Prepayment Scam",
    channel: "whatsapp",
    language: "Mixed",
    difficulty: "hard",
    referenceTrust: 40,
    signals: "Small real payout first, then deposit demand + urgency",
    text: "🎉 Welcome to PixelEarn! Aapka Task 1 complete ho gaya — ₹150 wallet mein credited ✅. अब next level: Premium Task — ₹2,000 deposit karke VIP room unlock karein aur ₹3,200 instant return paayein. ऑफर आज रात 11 बजे तक वैध है. Payment UPI: pixelearn@okaxis. ध्यान दें: deposit ke bina withdrawal block rahega.",
  },
  {
    id: "investment-group",
    scamType: "Investment / Trading Scam",
    channel: "whatsapp",
    language: "Mixed",
    difficulty: "hard",
    referenceTrust: 15,
    signals: "Guaranteed returns + joining fee + withdrawal tax + secrecy",
    text: "🔥 NSE Certified Trading Channel 🔥 Aaj ka call: BUY HINDALCO @640, target 680. कल के members ने 42% profit बुक किया. Guaranteed daily returns 10-15%, principal 100% safe. Joining fee ₹5,000 UPI: traderking@ybl. Withdrawal par sirf 12% advance tax lagta hai. Group ke screenshots kisi ko share na karein — market manipulation case ho sakta hai.",
  },
  {
    id: "utility-disconnection",
    scamType: "Utility Disconnection Scam",
    channel: "sms",
    language: "Hinglish",
    difficulty: "hard",
    referenceTrust: 45,
    signals: "Deadline + lookalike domain + fake helpline",
    text: "BSES ALERT: Aapke bijli connection ka bill ₹2,847 pending hai. Connection aaj raat 9 baje DISCONNECT kar diya jayega. Turant payment karein: bses-billpay.online/pay | Helpline: 84209-XXXXX. Ye final reminder hai, payment confirm hone ke baad connection restore hoga.",
  },
  {
    id: "loan-extortion",
    scamType: "Loan-App Extortion",
    channel: "whatsapp",
    language: "Hinglish",
    difficulty: "hard",
    referenceTrust: 35,
    signals: "Contact/gallery threat + UPI collect + intimidation",
    text: "Aapne LoanKart app se ₹8,000 liya tha aur 1 month se repay nahi kiya hai. Aapke phone ke contacts, gallery photos aur Aadhaar copy humare paas hain. 1 ghante mein ₹15,000 (late fee ke saath) clear karein — WhatsApp par aayi UPI collect request accept karein. Report karne ki koshish ki toh aapki photos sab contacts ko bhej denge.",
  },
  {
    id: "voice-clone-emergency",
    scamType: "Fake Emergency (Voice-Clone)",
    channel: "whatsapp",
    language: "Hinglish",
    difficulty: "hard",
    referenceTrust: 35,
    signals: "Family emergency + medical urgency + secrecy + excuse for no call",
    text: "Papa main Rhea bol rahi hoon. Mera accident ho gaya hai, hospital mein admit ho gayi hoon, operation ke liye ₹65,000 deposit abhi chahiye warna treatment rok denge. Phone nurse ke paas hai isliye message kar rahi hoon, voice weak hai. Paise citycare@ybl par bhej do. Mummy ko mat batana, wo tension ho jayegi. Main baad mein call karungi.",
  },
  {
    id: "corporate-phishing",
    scamType: "Corporate Phishing",
    channel: "email",
    language: "English",
    difficulty: "hard",
    referenceTrust: 45,
    signals: "Professional tone + refundable-fee trick + personal UPI",
    text: "Subject: Action Required — Laptop Shipment for Your Infosys Onboarding. Dear Candidate, Congratulations on your offer (offer letter attached). Per HR policy, a one-time refundable shipment insurance of ₹2,499 is required before we dispatch your company laptop. Pay to vendor UPI: infosys-logistics@ybl. The amount is credited back with your first salary. Reply on this thread with the payment screenshot within 48 hours, after which the offer stands withdrawn.",
  },
  {
    id: "genuine-otp",
    scamType: "Genuine (hard negative)",
    channel: "sms",
    language: "English",
    difficulty: "hard",
    referenceTrust: 97,
    signals: "False-positive probe: mentions OTP but never requests it",
    text: "Your SBI OTP is 482913 for a debit of Rs. 2,000 on card xx4832. DO NOT share this OTP with anyone. If this was not initiated by you, call 1800-XXX-XXXX immediately.",
  },
  {
    id: "genuine-family",
    scamType: "Genuine (control)",
    channel: "whatsapp",
    language: "Hinglish",
    difficulty: "easy",
    referenceTrust: 95,
    signals: "Everyday family message — must stay green",
    text: "Beta Sunday ko lunch ke liye time se aa jaana, mummy ne palak paneer banaya hai. Aate waqt market se dahi le aana. Sunday ko traffic bahut hota hai, isliye thoda jaldi nikalna.",
  },
];

export const SAMPLE_CHIP_IDS = ["digital-arrest", "fake-internship", "genuine-family", "utility-disconnection"];
