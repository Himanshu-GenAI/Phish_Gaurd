import { RULES } from "./lexicon";
import type { RuleHit } from "./types";

const NEGATED_RULES = new Set(["otp", "fee", "apk"]);

const NEGATION_BEFORE = /\b(?:do\s*not|don'?t|never|no|not|neither|nor|without|mat|kabhi\s*nahi)\b/i;
const NEGATION_AFTER = /\b(?:mat\s*(?:karna|karein|batao|share|do|dena)?|kabhi\s*nahi|nahi\s*karna|nahi\s*hoga|mat\s*karo)\b/i;

export function isMatchNegated(text: string, matchIndex: number, matchLength: number): boolean {
  // Preceding window: up to 40 characters before matchIndex in the same sentence
  const start = Math.max(0, matchIndex - 40);
  const preceding = text.slice(start, matchIndex);
  const lastBoundary = Math.max(
    preceding.lastIndexOf("."),
    preceding.lastIndexOf("!"),
    preceding.lastIndexOf("?"),
    preceding.lastIndexOf("\n"),
    preceding.lastIndexOf("\r"),
    preceding.lastIndexOf(";")
  );
  const clauseBefore = lastBoundary >= 0 ? preceding.slice(lastBoundary + 1) : preceding;
  if (NEGATION_BEFORE.test(clauseBefore)) return true;

  // Trailing window: up to 40 characters after match in the same sentence
  const afterStart = matchIndex + matchLength;
  const trailing = text.slice(afterStart, Math.min(text.length, afterStart + 40));
  const nextBoundary = trailing.search(/[.!?\n\r;]/);
  const clauseAfter = nextBoundary >= 0 ? trailing.slice(0, nextBoundary) : trailing;
  if (NEGATION_AFTER.test(clauseAfter)) return true;

  return false;
}

export function runRules(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of RULES) {
    const checkNegation = NEGATED_RULES.has(rule.id);
    for (const p of rule.patterns) {
      if (!checkNegation) {
        const m = text.match(p);
        if (m) {
          hits.push({
            id: rule.id,
            label: rule.label,
            category: rule.category,
            weight: rule.weight,
            evidence: m[0].length > 80 ? m[0].slice(0, 80) + "…" : m[0],
          });
          break;
        }
      } else {
        const globalRegex = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
        let m: RegExpExecArray | null;
        let validMatch: RegExpExecArray | null = null;
        while ((m = globalRegex.exec(text)) !== null) {
          if (!isMatchNegated(text, m.index, m[0].length)) {
            validMatch = m;
            break;
          }
          if (m[0].length === 0) globalRegex.lastIndex++;
        }
        if (validMatch) {
          hits.push({
            id: rule.id,
            label: rule.label,
            category: rule.category,
            weight: rule.weight,
            evidence: validMatch[0].length > 80 ? validMatch[0].slice(0, 80) + "…" : validMatch[0],
          });
          break;
        }
      }
    }
  }
  return hits;
}

export function ruleRisk(hits: RuleHit[]): number {
  return hits.reduce((s, h) => s + h.weight, 0);
}

