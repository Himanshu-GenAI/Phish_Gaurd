import type { Rule } from "./types";

export const RULES: Rule[] = [
  // ── PAYMENT ──────────────────────────────────────────────
  {
    id: "fee",
    label: "Demands an upfront fee / deposit",
    category: "payment",
    weight: 25,
    patterns: [
      /(?<!\bno\s)(registration|processing|membership|kyc|joining)\s*(fees?|charges?|amount)/i,
      /(courier|dispatch|kit|uniform|training|verification)\s*(fees?|charges?|deposit)/i,
      /(refundable\s+)?security\s*(deposit|charges?|amount)/i,
      /token\s*amount/i,
      /fee\s*(bharna|bharo|do)\b/i,
      /advance\s*paisa/i,
    ],
  },
  {
    id: "pay-upi",
    label: "Payment to a personal UPI handle",
    category: "payment",
    weight: 20,
    patterns: [
      /\b[\w.-]+@(upi|ybl|oksbi|okaxis|paytm|ibl|axl|okhdfcbank|icici)\b/i,
      /\bpay\b.{0,30}(via|to|on)\s*(upi|gpay|phonepe|paytm)\b/i,
      /(qr\s*code|qr)\s*(scan\s*karo|scan\s*karke|bhejo)/i,
      /scan\s*(this\s*)?qr(\s*code)?.{0,30}(receive|payment|paise|money|upi|phonepe|gpay|paytm|karo)/i,
    ],
  },
  {
    id: "transfer-demand",
    label: "Demands a money transfer",
    category: "payment",
    weight: 15,
    patterns: [
      /(transfer|send|deposit)\s*(₹|rs\.?\s?)\s?\d[\d,]*/i,
      /(₹|rs\.?\s?)?\s?\b\d[\d,]{3,12}\b\s*(turant\s*)?(bhejo|bhej\s*d[oe]|jama\s*karo|transfer\s*kar(o|wa\s*do))\b/i,
      /pais[ae]\s*(bhejo|bhej\s*d[oe]|jama\s*karo|transfer\s*karo)/i,
      /(?:abhi\s+)?fund\s*transfer\s*kar(o|ein|iye)\b/i,
    ],
  },

  // ── CREDENTIAL ───────────────────────────────────────────
  {
    id: "otp",
    label: "Asks for OTP / PIN / CVV / password",
    category: "credential",
    weight: 25,
    patterns: [
      /(share|send|confirm|enter|give|tell)\s*(your\s*)?((secret|login|upi|atm)\s*){0,2}(otp|pin|cvv|password|mpin)/i,
      /(upi\s*|atm\s*)?(pin|otp|cvv|mpin)\s*(dalo|enter\s*karo|batao|share\s*karo)\b/i,
      /otp\s*batao/i,
    ],
  },
  {
    id: "remote-app",
    label: "Requests remote-control app installation",
    category: "credential",
    weight: 25,
    patterns: [
      /anydesk/i,
      /teamviewer/i,
      /rustdesk/i,
      /quick\s*support/i,
      /remote\s*(assist|support|access|control|diagnostic)/i,
      /screen\s*(share|sharing|verification)/i,
      /(diagnostic|screen)\s*sharing\s*session/i,
    ],
  },

  // ── AUTHORITY ────────────────────────────────────────────
  {
    id: "authority",
    label: "Impersonates a government or law-enforcement agency",
    category: "authority",
    weight: 20,
    patterns: [
      /\bCBI\b/,
      /\bNCB\b/,
      /enforcement\s*directorate/i,
      /(income\s*tax\s*(department|officer|notice|raid|refund|rebate|summons|demand|dossier|penalty|e-filing)|tax\s*evasion)/i,
      /\bcustoms\b/i,
      /cyber\s*(cell|crime\s*branch)/i,
      /digital\s*arrest/i,
      /\bFIR\b.{0,30}(filed|registered|lodged)/i,
      /\bwarrant\b/i,
      /aadhaar\s*(suspend|freeze|block|cancel)/i,
      /\b(TRAI|RBI|SEBI)\s*notice/i,
    ],
  },
  {
    id: "kyc-threat",
    label: "Threatens account / service suspension",
    category: "authority",
    weight: 18,
    patterns: [
      /kyc\s*(expire|suspend|update|verify|pending)/i,
      /(electricity|power\s*supply|bijli|meter)[^\n.!?]{0,60}(cut|disconnect(ed)?|kaat\s*d[ie]|band)\b/i,
      /(account|services?|netbanking)\s*(blocked|suspended|frozen|freeze|closed|deactivated)/i,
      /parcel.{0,60}seized/i,
      /\b(drugs|mdma|cocaine|heroin|contraband)\b/i,
      /\bcustoms\b.{0,30}(seized|parcel|package)/i,
    ],
  },

  // ── MANIPULATION ─────────────────────────────────────────
  {
    id: "urgency",
    label: "Creates false urgency / time pressure",
    category: "manipulation",
    weight: 15,
    patterns: [
      /within\s*\d+\s*(minutes?|hours?)/i,
      /today\s*only/i,
      /last\s*chance/i,
      /\b(immediately|urgent|asap)\b/i,
      /(offer|slot|deal)\s*expires?/i,
      /only\s*\d+\s*slots?\s*left/i,
      /\baaj\s+(hi|raat)\b/i,
      /jaldi\s*karo/i,
      /\bturant\b/i,
      /closes?\s*today/i,
      /\babhi\s*(login|karo|update|verify|bhejo|transfer)\b/i,
    ],
  },
  {
    id: "secrecy",
    label: "Demands secrecy from family / friends",
    category: "manipulation",
    weight: 12,
    patterns: [
      /do\s*not\s*(share|tell)\s*(this\s*)?(with\s*)?anyone/i,
      /don'?t\s*share\s*with\s*your\s*family/i,
      /(keep|maintain)\s+(this\s+)?confidential/i,
      /(strictly?\s+)?confidential\s+(investigation|dossier|notice|order)/i,
      /(strict\s+)?communication\s+silence/i,
      /(call|phone|baat)\s*mat\s*karna\b/i,
      /kisi\s*ko\s*mat\s*batana/i,
    ],
  },

  // ── INVESTMENT ───────────────────────────────────────────
  {
    id: "guaranteed",
    label: "Promises guaranteed / unrealistic returns",
    category: "investment",
    weight: 15,
    patterns: [
      /(guaranteed|pakka)\s*(profit|returns?|fayda|munafa)/i,
      /100\s*%\s*(profit|safe|returns?)/i,
      /\bzero\s*risk\b/i,
      /double\s*your\s*money/i,
      /daily\s*(\d+%\s*)?(income|earning|profit|returns?)/i,
      /(crypto|forex|stock|share\s*market)\s*(signals?|tips?)/i,
    ],
  },

  // ── JOB ──────────────────────────────────────────────────
  {
    id: "channel-mismatch",
    label: "HR / interview only on Telegram or WhatsApp",
    category: "job",
    weight: 15,
    patterns: [
      /(hr|interview)\s*(only\s*)?(on\s*)?(telegram|whatsapp)/i,
      /t\.me\/\S+/i,
      /no\s*(interview|resume|experience)\s*needed/i,
      /join\s*(our\s*)?(whatsapp|telegram)\s*group/i,
    ],
  },
  {
    id: "too-good-job",
    label: "Too-good-to-be-true salary / earning claims",
    category: "job",
    weight: 12,
    patterns: [
      /\b(₹|rs\.?\s?)\s?[\d,]{3,}\s*(\/|per\s*)?(day|hour|hr)\b/i,
      /\b(earn|income)\b.{0,15}(₹|rs\.?\s?)\s?[\d,]{3,}\s*(daily|per\s*day|from\s*home)/i,
      /\bwork\s*from\s*home\b.{0,40}(₹|rs\.?\s?)\s?[\d,]{3,}/i,
      /earn\s*(₹|rs\.?\s?)\s?[\d,]{3,}\s*daily/i,
    ],
  },

  // ── BAIT ─────────────────────────────────────────────────
  {
    id: "lottery",
    label: "Lottery / lucky-draw / prize-claim bait",
    category: "bait",
    weight: 15,
    patterns: [
      /you\s*have\s*won/i,
      /lucky\s*draw/i,
      /\blottery\b/i,
      /\bKBC\b/,
      /unclaimed\s*refund/i,
    ],
  },

  // ── DELIVERY ─────────────────────────────────────────────
  {
    id: "apk",
    label: "Pushes a sideloaded APK or unofficial app",
    category: "delivery",
    weight: 20,
    patterns: [
      /\.apk\b/i,
      /\bapk\b/i,
      /download\s*the\s*app\s*from\s*the\s*link/i,
      /not\s*available\s*on\s*play\s*store/i,
    ],
  },
  {
    id: "shortlink",
    label: "Uses a URL shortener to hide the real destination",
    category: "delivery",
    weight: 12,
    patterns: [
      /\bbit\.ly\b/i,
      /\btinyurl\b/i,
      /\bcutt\.ly\b/i,
      /\bt\.co\b/i,
      /\brb\.gy\b/i,
      /\bis\.gd\b/i,
      /\brebrand\.ly\b/i,
      /\bbit\.do\b/i,
    ],
  },

  // ── LEGITIMACY (negative weight = reduces risk) ──────────
  {
    id: "no-fee",
    label: "Explicitly states no fees required",
    category: "legitimacy",
    weight: -8,
    patterns: [
      /no\s*(registration|joining|processing)\s*(fee|fees|charges?)/i,
      /free\s*to\s*(apply|join)/i,
      /koi\s*fee\s*nahi/i,
    ],
  },
  {
    id: "formal-process",
    label: "Mentions a formal hiring / interview process",
    category: "legitimacy",
    weight: -6,
    patterns: [
      /interview\s*scheduled\s*(on|for)\b/i,
      /offer\s*letter\s*(will\s*be\s*)?(sent|attached|emailed)/i,
    ],
  },
  {
    id: "corporate-email",
    label: "Uses a corporate (non-freemail) email domain",
    category: "legitimacy",
    weight: -5,
    patterns: [
      /\b[\w.-]+@(?!gmail|yahoo|hotmail|outlook|rediffmail)[\w.-]+\.\w{2,}\b/i,
    ],
  },
];
