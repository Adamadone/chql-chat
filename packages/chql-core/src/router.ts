// See ./CONTEXT.md for module overview.
//
// Stateless keyword router for the prompt composer. Given the user-message
// history, returns the conditional CHQL_REFERENCE sections that should be
// included on this turn. Designed for the small-local-model path (the cloud
// providers ship `sections: 'all'` to keep their prompt cache stable).
//
// Routing principle: over-inclusion is safe (more tokens, still produces valid
// CHQL); under-inclusion is dangerous (model lacks the K-key catalog it needs
// and either fabricates K-keys or refuses). Triggers err toward recall.

import type { SectionId } from "./reference.js";
import { SECTION_IDS } from "./reference.js";

interface SectionRule {
  id: SectionId;
  patterns: RegExp[];
}

// The characteristic-code list is reproduced inline so a user typing a real
// code (`filling_value`, `air_pressure`, …) deterministically pulls in the
// characteristic section. The list mirrors the vocabulary in reference.ts;
// kept in sync manually because the rule is part of the composer contract.
const CHARACTERISTIC_CODES = [
  "filling_value",
  "air_pressure",
  "bottle_mass",
  "bottle_weight",
  "bottle_state",
  "env_temperature",
  "env_humidity",
  "speed",
  "quality",
  "chilling",
  "cleanliness",
  "input_quality",
  "input_quality_ordinal",
  "input_temperature",
  "label_position_x",
  "label_position_y",
  "ai_letters_check",
  "capping_start-force",
  "capping_start-stroke",
  "capping_start-time",
  "local_maximum-force",
  "local_maximum-stroke",
  "local_maximum-time",
  "local_minimum-force",
  "local_minimum-stroke",
  "local_minimum-time",
  "stroke-force",
  "time-force",
  "time-stroke",
] as const;

/** Build a regex that matches any of the listed string literals (escaped). */
function anyOf(values: readonly string[], flags = "i"): RegExp {
  const escaped = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:${escaped.join("|")})`, flags);
}

const RULES: SectionRule[] = [
  {
    id: "part",
    patterns: [
      // Known part types / descriptions
      /\b(?:IPA|NEIPA|ALE)\b/i,
      /\b(?:IPA CHYSTAT|NEIPA YARVYN|ALE mySCADA)\b/i,
      // Generic vocabulary
      /\bparts?\b/i,
      /\bproducts?\b/i,
      // Part-level K-keys: K1001 / K1002 / K1008 / K1044
      /\bK10\d{2}\b/,
    ],
  },
  {
    id: "char",
    patterns: [
      // Real characteristic codes (deterministic match)
      anyOf(CHARACTERISTIC_CODES),
      // Common natural-language fragments that overwhelmingly refer to the
      // most-mentioned characteristic codes in this deployment. Catches
      // phrasings like "filling values" (vs. the literal `filling_value`)
      // or "bottle weight" (vs. `bottle_weight`) without the model needing
      // to fuzzy-match the underscore form unaided.
      /\bfilling\b/i,
      /\bpressure\b/i,
      /\btemperature\b/i,
      /\bweight\b/i,
      /\bmass\b/i,
      // Generic vocabulary — single-word triggers that imply char metadata
      /\bcharacteristics?\b/i,
      /\bspec(?:ification)?s?\b/i,
      /\btargets?\b/i,
      /\bnominals?\b/i,
      /\bacceptance\b/i,
      /\bunits?\b/i,
      /\blimits?\b/i,
      /\btolerances?\b/i,
      // Characteristic-level K-keys: K2001..K2142 (NOT K2311 — that's ops)
      /\bK2[01]\d{2}\b/,
      /\bK22\d{2}\b/,
    ],
  },
  {
    id: "value",
    patterns: [
      // Value-level vocabulary
      /\bvalues?\b/i,
      /\bmeasured\b/i,
      /\bmeasurements?\b/i,
      /\breadings?\b/i,
      /\bpieces?\b/i,
      /\bbatch(?:es)?\b/i,
      // Numeric-comparison vocabulary (K0001 questions: "above 0.5", "below 5")
      /\babove\b/i,
      /\bbelow\b/i,
      /\bover\b/i,
      /\bunder\b/i,
      /\bgreater\b/i,
      /\bless\b/i,
      // Time vocabulary (timestamps live in value-level K0004)
      /\btime(?:stamp)?s?\b/i,
      /\btoday\b/i,
      /\byesterday\b/i,
      /\btomorrow\b/i,
      /\bhours?\b/i,
      /\bminutes?\b/i,
      /\bdays?\b/i,
      /\bweeks?\b/i,
      /\bmonths?\b/i,
      /\byears?\b/i,
      /\bshifts?\b/i,
      /\blast\b/i,
      /\bsince\b/i,
      /\bbefore\b/i,
      /\bafter\b/i,
      /\baround\b/i,
      /\brecent\b/i,
      /\bcurrent\b/i,
      // Times of day
      /\bmidnight\b/i,
      /\bnoon\b/i,
      /\bmorning\b/i,
      /\bafternoon\b/i,
      /\bevening\b/i,
      /\bnight\b/i,
      // Month names (long form). Natural-language dates like "May 2026",
      // "May 11, 2026" need value because the expected CHQL filters K0004.
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      // ISO-8601 date or partial date
      /\b\d{4}-\d{2}-\d{2}\b/,
      /\b\d{4}-\d{2}\b/,
      // Value-level K-keys: K0001 / K0004 / K0010 / K0014 / K0053
      /\bK00\d{2}\b/,
    ],
  },
  {
    id: "ops",
    patterns: [
      /\bOP\d+\b/i,
      /\bEXT\b/,
      /\boperations?\b/i,
      /\bK2311\b/,
    ],
  },
  {
    id: "alarms",
    patterns: [
      /\balarms?\b/i,
      /\bflag(?:ged|s)?\b/i,
      /\bissues?\b/i,
      /\banomal(?:y|ies|ous)\b/i,
      /\babove\W*spec(?:ification)?\b/i,
      /\bbelow\W*spec(?:ification)?\b/i,
      /\bout\W*of\W*spec(?:ification)?\b/i,
      /\bover\W*spec(?:ification)?\b/i,
      /\bunder\W*spec(?:ification)?\b/i,
      /\boutside\b/i, // "outside the specification limits", "outside tolerance"
      /\b(?:specification|tolerance|acceptance)\s+limits?\b/i,
      /\breject(?:s|ed|ion)?\b/i,
      /\bfail(?:s|ed|ure)?\b/i,
      /\bdefect(?:s|ive)?\b/i,
      /\bwarn(?:s|ed|ing)?\b/i,
      /\babnormal\b/i,
      // Explicit alarm names
      /aboveSpecification|belowSpecification|aboveAcceptance|belowAcceptance/,
      /\battribute\b/i,
    ],
  },
  {
    id: "antlr",
    patterns: [
      // Rarely fires; effectively off for normal queries. Only triggers on
      // meta-questions about the grammar itself.
      /\bgrammar\b/i,
      /\bantlr\b/i,
      /\b(?:lexer|parser)\b/i,
      /\bbnf\b/i,
      /\bebnf\b/i,
    ],
  },
];

/**
 * Decide which conditional CHQL_REFERENCE sections to include based on the
 * user-message history of the chat. Scans the concatenation of all user
 * messages; over-inclusion (returning a section the model doesn't strictly
 * need) is safe and preferable to under-inclusion.
 *
 * Returns sections in canonical (`SECTION_IDS`) order so consumers can rely on
 * a stable ordering for logging / cache keys.
 */
export function routeSections(userMessageTexts: string[]): SectionId[] {
  const haystack = userMessageTexts.join("\n");
  const hits: SectionId[] = [];
  for (const id of SECTION_IDS) {
    const rule = RULES.find((r) => r.id === id);
    if (!rule) continue;
    if (rule.patterns.some((p) => p.test(haystack))) {
      hits.push(id);
    }
  }
  return hits;
}
