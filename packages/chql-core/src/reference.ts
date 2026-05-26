// See ./CONTEXT.md for module overview.
//
// CHQL_REFERENCE is split into a CORE prefix (always shipped) plus a record of
// optional sections. `buildChqlReference(sections)` re-assembles the full
// reference in a fixed canonical order so the resulting string is identical to
// the legacy single-string export when `sections === 'all'`. This split exists
// so that the local-vLLM path can route in only the sections the user actually
// needs, reducing prefill tokens; Anthropic / OpenAI keep the full block for
// prompt-cache stability.

/** Conditional section IDs. CORE is always shipped and has no ID. */
export const SECTION_IDS = ["part", "char", "value", "ops", "alarms", "antlr"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

// ─── CORE: prefix (always shipped) ──────────────────────────────────────────

const CORE_PREFIX = `
## CHQL (chy.stat Query Language) — Complete Reference

CHQL is a text-based domain-specific language for querying industrial measurement data.
It is defined by an ANTLR4 grammar. You MUST only generate queries that conform to this grammar.

### Lexer Rules

- **K-key identifiers**: \`K\` optionally followed by \`X\`, then one or more digits.
  Examples: K0001, K0014, K1001, K1002, K2002, K2311, KX001
- **Numbers**: Optional minus sign, one or more digits, optional decimal part.
  Examples: 42, -3, 80.5, 0.001
- **Strings**: Enclosed in single quotes. Cannot contain single quotes inside.
  Examples: 'IPA CHYSTAT', 'filling_value', '10113943', '2026-05-11T00:00:09+02:00'
- **Comparison operators**: = (equals), < (less than), <= (less or equal), > (greater than), >= (greater or equal), LIKE (pattern match), =~ (regex match)
- **Keywords** (case-insensitive): ALARM, ALL, AND, ANY, HAS, IN, IS, LIKE, MARK, MATCHES, NO, NOT, NULL, OR, VALUE, VALUES
- **Grouping**: ( ) parentheses, , (comma for IN lists)
- **Whitespace**: Spaces, tabs, newlines are ignored (used freely for readability)

### Parser Rules (Query Structure)

A CHQL query is composed of one or more **criteria**, which can be combined:

1. **Simple criteria** (leaf nodes):
   - \`ALL\` — matches everything (note: some deployments reject this and require at least one explicit criterion)
   - \`<K-key> <operator> <value>\` — comparison (e.g. \`K0001 > 0.5\`, \`K2002 = 'filling_value'\`)
   - \`<K-key> IN (<value>, <value>, ...)\` — set membership (e.g. \`K1002 IN ('IPA CHYSTAT', 'NEIPA YARVYN')\`)
   - \`<K-key> IS NULL\` — null check
   - \`HAS NO ALARM\` — no alarm present on the value
   - \`HAS ALARM '<alarm_name>'\` — specific named alarm (see alarm vocabulary below)
   - \`HAS MARK <number>\` — specific mark value

2. **Compound criteria** (combining simple criteria):
   - \`<criteria> AND <criteria> [AND <criteria> ...]\` — logical AND
   - \`<criteria> OR <criteria> [OR <criteria> ...]\` — logical OR
   - \`NOT <criteria>\` — negation
   - \`(<criteria>)\` — grouping with parentheses (controls precedence)
   - \`ANY VALUE MATCHES (<criteria>)\` — any value in a set matches
   - \`ALL VALUES MATCHES (<criteria>)\` — all values in a set match

### Common K-key Identifiers

The chy.stat data model has three entity levels — **Part** (the manufactured product), **Characteristic** (a measurable property of a part), and **Value** (an individual measurement of a characteristic). The K-key tables below are grouped accordingly. When the user's phrasing is ambiguous, use the group that matches the entity they are asking about. If you are unsure, ask the user.

This deployment does **not** expose catalog tables (operation-name lookups, product catalogs, etc.) through CHQL. Operation references go through K2311 (the characteristic-level operation code), not through a separate catalog K-key. Do not invent K4062/K4063 etc.
`;

// ─── Conditional sections ───────────────────────────────────────────────────

const SECTION_PART = `
#### Part-level K-keys

| K-key | Meaning                                  | Type    | Sample value   |
|-------|------------------------------------------|---------|----------------|
| K1001 | Part code                                | String  | '3'            |
| K1002 | Part description                         | String  | 'IPA CHYSTAT'  |
| K1008 | Part type                                | String  | 'IPA'          |
| K1044 | ID of the product in the Product catalog | Integer | 3              |

**Part vocabulary used in this deployment** (domain values, not inferable from the grammar):
- Known part descriptions (K1002): 'ALE mySCADA', 'NEIPA YARVYN', 'IPA CHYSTAT'.
- Known part types (K1008): 'ALE', 'NEIPA', 'IPA'.
`;

const SECTION_CHAR = `
#### Characteristic-level K-keys

| K-key | Meaning                                                                                                                   | Type    | Sample value    |
|-------|---------------------------------------------------------------------------------------------------------------------------|---------|-----------------|
| K2001 | Characteristic numeric code                                                                                               | String  | '10'            |
| K2002 | Characteristic code                                                                                                       | String  | 'filling_value' |
| K2004 | Characteristic type. 0 = continuous; 1 = attribute; 3 = ordinal; 4 = nominal; 31 = curve                                  | Integer | 0               |
| K2005 | Characteristic class (how important the characteristic is. 0–4; 0 = unimportant; 4 = critical)                            | Integer | 3               |
| K2009 | Code of the measured quantity (length / diameter / surface roughness etc.)                                                | Integer | 270             |
| K2022 | Number of decimal places                                                                                                  | Integer | 3               |
| K2090 | Whether the characteristic is a process parameter ('Process') or a product specification characteristic ('Specification') | String  | 'Specification' |
| K2092 | Characteristic name (human-readable label)                                                                                | String  | 'Filling Value' |
| K2100 | Target value                                                                                                              | Float   | 0.495           |
| K2101 | Nominal value (drawing measure)                                                                                           | Float   | 0.495           |
| K2110 | Lower specification limit                                                                                                 | Float   | 0.485           |
| K2111 | Upper specification limit                                                                                                 | Float   | 0.505           |
| K2116 | Lower acceptance limit                                                                                                    | Float   | 0.487           |
| K2117 | Upper acceptance limit                                                                                                    | Float   | 0.503           |
| K2120 | Lower specification limit type (1 = specification limit; 2 = physical (natural) limit)                                    | Integer | 1               |
| K2121 | Upper specification limit type (1 = specification limit; 2 = physical (natural) limit)                                    | Integer | 1               |
| K2142 | Unit description                                                                                                          | String  | 'l'             |

**Characteristic vocabulary used in this deployment** (domain values, not inferable from the grammar):
- Common characteristic codes (K2002) include (non-exhaustive): 'filling_value', 'air_pressure', 'bottle_mass', 'bottle_weight', 'bottle_state', 'env_temperature', 'env_humidity', 'speed', 'quality', 'chilling', 'cleanliness', 'input_quality', 'input_quality_ordinal', 'input_temperature', 'label_position_x', 'label_position_y', 'ai_letters_check', 'capping_start-force', 'capping_start-stroke', 'capping_start-time', 'local_maximum-force', 'local_maximum-stroke', 'local_maximum-time', 'local_minimum-force', 'local_minimum-stroke', 'local_minimum-time', 'stroke-force', 'time-force', 'time-stroke'. Treat user-supplied characteristic names as canonical when they look reasonable; correct obvious typos against this list.
`;

const SECTION_VALUE = `
#### Value-level K-keys

| K-key | Meaning                                      | Type    | Sample value                  |
|-------|----------------------------------------------|---------|-------------------------------|
| K0001 | Measured value                               | Float   | 0.495                         |
| K0004 | Timestamp of the value                       | Date    | '2026-05-11T00:00:09+02:00'   |
| K0010 | ID of the operation on the value             | Integer | 4                             |
| K0014 | Piece identifier                             | String  | '10113943'                    |
| K0053 | Batch number                                 | String  | '69752-ALE'                   |
`;

// K2311 lives in OPS (not CHAR) so the operation-routed subset is self-contained:
// a question like "show OP30 measurements" triggers OPS only, and OPS must
// carry both the K-key row and the vocabulary line so the model can compose
// `K2311 = 'OP30'` without seeing the characteristic table.
const SECTION_OPS = `
#### Operation-code K-key

| K-key | Meaning                                                                 | Type    | Sample value    |
|-------|-------------------------------------------------------------------------|---------|-----------------|
| K2311 | Operation code (on the characteristic) — use this for operation filters | String  | 'OP30'          |

**Operation vocabulary used in this deployment** (domain values, not inferable from the grammar):
- Known operation codes (K2311): 'EXT', 'OP30', 'OP35', 'OP40', 'OP50', 'OP60'. There is no 'OP10' or 'OP20' in this deployment.
`;

const SECTION_ALARMS = `
#### Alarms

**Alarm vocabulary** — the alarm names accepted by \`HAS ALARM '<name>'\` in this deployment are:
- \`'aboveSpecification'\` — measured value above the upper specification limit (K2111).
- \`'belowSpecification'\` — measured value below the lower specification limit (K2110).
- \`'aboveAcceptance'\` — measured value above the upper acceptance limit (K2117).
- \`'belowAcceptance'\` — measured value below the lower acceptance limit (K2116).
- \`'attribute'\` — attribute-style flag (used on attribute/ordinal/nominal characteristics).

Use \`HAS NO ALARM\` when the user asks for "no issues", "no alarms", "clean readings". Use \`NOT HAS NO ALARM\` when the user asks for "any alarm", "anything flagged", "issues". Use specific alarm names from the list above only when the user names them explicitly.

**Alarm query construction**:
- \`HAS NO ALARM\` — measurements with no alarm at all.
- \`NOT HAS NO ALARM\` — measurements with at least one alarm (any kind).
- \`HAS ALARM 'aboveSpecification' OR HAS ALARM 'belowSpecification'\` — out-of-spec readings.
`;

// ─── CORE: suffix (always shipped) ──────────────────────────────────────────

const CORE_SUFFIX = `
### Query Construction Guidelines

1. **String values** must ALWAYS be wrapped in single quotes: \`K2002 = 'filling_value'\` (correct), NOT \`K2002 = filling_value\` (wrong).
2. **Numeric values** are bare (no quotes): \`K0001 < 80.5\` (correct), NOT \`K0001 < '80.5'\` (wrong, unless comparing as string).
3. **Date/time values** are strings in ISO 8601 format with timezone: \`K0004 >= '2026-05-11T06:00:00+02:00'\`.
4. **Combining conditions**: Use AND/OR with parentheses for clarity: \`K1002 = 'IPA CHYSTAT' AND (K2311 = 'OP30' OR K2311 = 'OP40')\`.
5. **Negation**: \`NOT K2002 = 'test'\` or \`NOT (K0001 > 100 AND K0001 < 200)\`.

### Example Queries

Below are examples mapping natural language requests to correct CHQL queries. Values are drawn from the K-key tables and vocabulary above.

**Example 1**: "Find all measured values for piece with ID 10113943"
→ \`K0014 = '10113943'\`

**Example 2**: "Find all measurements of characteristic filling_value from the last hour"
→ \`K2002 = 'filling_value' AND K0004 >= '2026-05-11T12:36:05+02:00' AND K0004 < '2026-05-11T13:36:05+02:00'\`
(Note: replace timestamps with actual current time calculations)

**Example 3**: "Find measurements of part IPA CHYSTAT from operations OP30 and OP40"
→ \`K1002 = 'IPA CHYSTAT' AND (K2311 = 'OP30' OR K2311 = 'OP40')\`

**Example 4**: "Give me measurements of characteristic air_pressure that are above the upper specification"
→ \`K2002 = 'air_pressure' AND HAS ALARM 'aboveSpecification'\`

**Example 5**: "Show OP30 measurements from the current shift"
→ \`K2311 = 'OP30' AND K0004 >= '2026-05-11T06:00:00+02:00' AND K0004 < '2026-05-11T14:00:00+02:00'\`
(Note: shift boundaries depend on the factory's shift schedule)

**Example 6**: "Find values of characteristic air_pressure from production batch 69752-ALE that are less than 5.0"
→ \`K0053 = '69752-ALE' AND K2002 = 'air_pressure' AND K0001 < 5.0\`

**Example 7**: "Find anything that flagged an alarm today for part NEIPA YARVYN"
→ \`K1002 = 'NEIPA YARVYN' AND K0004 >= '2026-05-11T00:00:00+02:00' AND K0004 < '2026-05-12T00:00:00+02:00' AND NOT HAS NO ALARM\`
`;

const SECTION_ANTLR = `
### ANTLR4 Grammar (Formal Specification)

For reference, here is the complete formal grammar:

\`\`\`
// Lexer
KKEY_IDENTIFIER: 'K' 'X'? [0-9]+;
NUMBER: '-'? [0-9]+ ('.' [0-9]+)?;
STRING: '\\'' ~'\\''* '\\'';
Operators: =, <, <=, >, >=, LIKE, =~ (regex match)
Keywords: ALARM, ALL, AND, ANY, HAS, IN, IS, LIKE, MARK, MATCHES, NO, NOT, NULL, OR, VALUE, VALUES

// Parser
criteria:
    simple_criteria
    | '(' criteria ')'
    | ANY VALUE MATCHES '(' criteria ')'
    | ALL VALUES MATCHES '(' criteria ')'
    | NOT criteria
    | criteria AND criteria (AND criteria)*
    | criteria OR criteria (OR criteria)*

simple_criteria:
    ALL
    | KKEY_IDENTIFIER comparison_operator kkey_value
    | KKEY_IDENTIFIER IN '(' kkey_value (',' kkey_value)* ')'
    | KKEY_IDENTIFIER IS NULL
    | HAS NO ALARM
    | HAS ALARM STRING
    | HAS MARK NUMBER

comparison_operator: = | < | <= | > | >= | LIKE | =~
kkey_value: NUMBER | STRING
\`\`\`
`;

/**
 * Section blobs in the canonical insertion order. Conditional sections are
 * placed between the K-key preamble (CORE_PREFIX) and the Query Construction
 * Guidelines (CORE_SUFFIX), except ANTLR which is appended at the very end as
 * an optional formal appendix.
 */
export const CHQL_REFERENCE_SECTIONS: Record<SectionId, string> = {
  part: SECTION_PART,
  char: SECTION_CHAR,
  value: SECTION_VALUE,
  ops: SECTION_OPS,
  alarms: SECTION_ALARMS,
  antlr: SECTION_ANTLR,
};

/** Conditional sections in the order they appear in the rendered reference. */
const MID_SECTIONS: readonly SectionId[] = ["part", "char", "value", "ops", "alarms"];

/**
 * Assemble the CHQL reference. `sections === 'all'` returns the full reference
 * (byte-equivalent to the legacy `CHQL_REFERENCE` constant). Passing an array
 * includes only the requested sections in canonical order; CORE is always
 * shipped.
 */
export function buildChqlReference(sections: SectionId[] | "all"): string {
  const want = sections === "all" ? new Set<SectionId>(SECTION_IDS) : new Set(sections);
  const parts: string[] = [CORE_PREFIX];
  for (const id of MID_SECTIONS) {
    if (want.has(id)) parts.push(CHQL_REFERENCE_SECTIONS[id]);
  }
  parts.push(CORE_SUFFIX);
  if (want.has("antlr")) parts.push(CHQL_REFERENCE_SECTIONS.antlr);
  return parts.join("");
}

/** Back-compat: the full reference string. Equivalent to `buildChqlReference('all')`. */
export const CHQL_REFERENCE: string = buildChqlReference("all");
