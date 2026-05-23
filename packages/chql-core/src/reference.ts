/**
 * @module @chql-chat/chql-core/reference — CHQL grammar reference text
 *
 * The static CHQL grammar reference embedded into the system prompt for
 * every LLM call. Kept as a single source of truth so callers (production
 * chat, Convex evaluation, local CLI eval) can't drift.
 *
 * The block is intentionally large (~4000+ tokens) so that it qualifies
 * for Anthropic's prompt caching minimum. Non-Anthropic providers see it
 * as plain text.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export const CHQL_REFERENCE = `
## CHQL (chy.stat Query Language) — Complete Reference

CHQL is a text-based domain-specific language for querying industrial measurement data.
It is defined by an ANTLR4 grammar. You MUST only generate queries that conform to this grammar.

### Lexer Rules

- **K-key identifiers**: \`K\` optionally followed by \`X\`, then one or more digits.
  Examples: K0001, K0014, K1001, K1002, K2002, K4062, K4063, KX123
- **Numbers**: Optional minus sign, one or more digits, optional decimal part.
  Examples: 42, -3, 80.5, 0.001
- **Strings**: Enclosed in single quotes. Cannot contain single quotes inside.
  Examples: 'IPA CHYSTAT', 'filling_value', '9891978', '2026-03-27T00:00:16+01:00'
- **Comparison operators**: = (equals), < (less than), <= (less or equal), > (greater than), >= (greater or equal), LIKE (pattern match), =~ (regex match)
- **Keywords** (case-insensitive): ALARM, ALL, AND, ANY, HAS, IN, IS, LIKE, MARK, MATCHES, NO, NOT, NULL, OR, VALUE, VALUES
- **Grouping**: ( ) parentheses, , (comma for IN lists)
- **Whitespace**: Spaces, tabs, newlines are ignored (used freely for readability)

### Parser Rules (Query Structure)

A CHQL query is composed of one or more **criteria**, which can be combined:

1. **Simple criteria** (leaf nodes):
   - \`ALL\` — matches everything
   - \`<K-key> <operator> <value>\` — comparison (e.g. \`K0001 > 80.5\`, \`K2002 = 'filling_value'\`)
   - \`<K-key> IN (<value>, <value>, ...)\` — set membership (e.g. \`K1002 IN ('IPA CHYSTAT', 'NEIPA YARVYN')\`)
   - \`<K-key> IS NULL\` — null check
   - \`HAS NO ALARM\` — no alarm present
   - \`HAS ALARM '<alarm_name>'\` — specific alarm (e.g. \`HAS ALARM 'valueOutsideSpecificationLimits'\`)
   - \`HAS MARK <number>\` — specific mark value

2. **Compound criteria** (combining simple criteria):
   - \`<criteria> AND <criteria> [AND <criteria> ...]\` — logical AND
   - \`<criteria> OR <criteria> [OR <criteria> ...]\` — logical OR
   - \`NOT <criteria>\` — negation
   - \`(<criteria>)\` — grouping with parentheses (controls precedence)
   - \`ANY VALUE MATCHES (<criteria>)\` — any value in a set matches
   - \`ALL VALUES MATCHES (<criteria>)\` — all values in a set match

### Common K-key Identifiers

The chy.stat data model has three entity levels — **Part** (the manufactured product), **Characteristic** (a measurable property of a part), and **Value** (an individual measurement of a characteristic) — plus **Catalog** lookup tables. The K-key tables below are grouped accordingly. When the user's phrasing is ambiguous, use the group that matches the entity they are asking about. If you are unsure, ask the user.

#### Part-level K-keys

| K-key | Meaning                                  | Type    | Sample value   |
|-------|------------------------------------------|---------|----------------|
| K1001 | Part code                                | String  | '3'            |
| K1002 | Part description                         | String  | 'IPA CHYSTAT'  |
| K1008 | Part type                                | String  | 'IPA'          |
| K1044 | ID of the product in the Product catalog | Integer | 1              |

#### Characteristic-level K-keys

| K-key | Meaning                                                                                                                   | Type    | Sample value    |
|-------|---------------------------------------------------------------------------------------------------------------------------|---------|-----------------|
| K2001 | Characteristic numeric code                                                                                               | String  | '10'            |
| K2002 | Characteristic code                                                                                                       | String  | 'filling_value' |
| K2004 | Characteristic type. 0 = continuous; 1 = attribute; 3 = ordinal; 4 = nominal; 31 = curve                                  | Integer | 0               |
| K2005 | Characteristic class (how important the characteristic is. 0–4; 0 = unimportant; 4 = critical)                            | Integer | 4               |
| K2009 | Code of the measured quantity (length / diameter / surface roughness etc.)                                                | Integer | 270             |
| K2022 | Number of decimal places                                                                                                  | Integer | 3               |
| K2090 | Whether the characteristic is a process parameter ('Process') or a product specification characteristic ('Specification') | String  | 'Specification' |
| K2092 | Characteristic name                                                                                                       | String  | 'Filling Value' |
| K2100 | Target value                                                                                                              | Float   | 0.495           |
| K2101 | Nominal value (drawing measure)                                                                                           | Float   | 0.495           |
| K2110 | Lower specification limit                                                                                                 | Float   | 0.485           |
| K2111 | Upper specification limit                                                                                                 | Float   | 0.505           |
| K2116 | Lower acceptance limit                                                                                                    | Float   | 0.487           |
| K2117 | Upper acceptance limit                                                                                                    | Float   | 0.503           |
| K2120 | Lower specification limit type (1 = specification limit; 2 = physical (natural) limit)                                    | Integer | 1               |
| K2121 | Upper specification limit type (1 = specification limit; 2 = physical (natural) limit)                                    | Integer | 1               |
| K2142 | Unit description                                                                                                          | String  | 'l'             |
| K2311 | Operation code (on the characteristic)                                                                                    | String  | 'OP30'          |

#### Value-level K-keys

| K-key | Meaning                                      | Type    | Sample value                  |
|-------|----------------------------------------------|---------|-------------------------------|
| K0001 | Measured value                               | Float   | 0.495                         |
| K0004 | Timestamp of the value                       | Date    | '2026-03-27T00:00:16+01:00'   |
| K0010 | ID of the operation in the Operation catalog | Integer | 4                             |
| K0014 | Piece identifier                             | String  | '9891978'                     |
| K0053 | Batch number                                 | String  | '68221-IPA'                   |

#### Catalog-level K-keys

| K-key | Meaning                 | Type   | Sample value   |
|-------|-------------------------|--------|----------------|
| K4062 | Operation code          | String | 'OP10'         |
| K4063 | Operation name          | String | 'Bottle Wash'  |
| K4112 | Product name            | String | 'IPA CHYSTAT'  |
| K4113 | Product type / category | String | 'IPA'          |

### Query Construction Guidelines

1. **String values** must ALWAYS be wrapped in single quotes: \`K2002 = 'filling_value'\` (correct), NOT \`K2002 = filling_value\` (wrong).
2. **Numeric values** are bare (no quotes): \`K0001 < 80.5\` (correct), NOT \`K0001 < '80.5'\` (wrong, unless comparing as string).
3. **Date/time values** are strings in ISO 8601 format with timezone: \`K0004 >= '2026-05-02T06:00:00+02:00'\`.
4. **Combining conditions**: Use AND/OR with parentheses for clarity: \`K1002 = 'IPA CHYSTAT' AND (K4063 = 'Bottle Wash' OR K4063 = 'Final Inspection')\`.
5. **Negation**: \`NOT K2002 = 'test'\` or \`NOT (K0001 > 100 AND K0001 < 200)\`.
6. **Alarm queries**: \`HAS ALARM 'valueOutsideSpecificationLimits'\` for out-of-tolerance, \`HAS NO ALARM\` for measurements without alarms.

### Example Queries

Below are examples mapping natural language requests to correct CHQL queries. Values are drawn from the K-key tables above:

**Example 1**: "Find all measured values for piece with ID 9891978"
→ \`K0014 = '9891978'\`

**Example 2**: "Find all measurements of characteristic filling_value from the last hour"
→ \`K2002 = 'filling_value' AND K0004 >= '2026-05-02T12:36:05+02:00' AND K0004 < '2026-05-02T13:36:05+02:00'\`
(Note: replace timestamps with actual current time calculations)

**Example 3**: "Find measurements of part IPA CHYSTAT from operations Bottle Wash and Final Inspection"
→ \`K1002 = 'IPA CHYSTAT' AND (K4063 = 'Bottle Wash' OR K4063 = 'Final Inspection')\`

**Example 4**: "Give me measurements of characteristic water_consumption that are out of tolerance"
→ \`K2002 = 'water_consumption' AND HAS ALARM 'valueOutsideSpecificationLimits'\`

**Example 5**: "Show measurements from operation OP10 from the current shift"
→ \`K4062 = 'OP10' AND K0004 >= '2026-05-02T06:00:00+02:00' AND K0004 < '2026-05-02T13:36:05+02:00'\`
(Note: shift boundaries depend on the factory's shift schedule)

**Example 6**: "Find values of characteristic water_consumption from production batch 68221-IPA that are less than 80.5"
→ \`K0053 = '68221-IPA' AND K2002 = 'water_consumption' AND K0001 < 80.5\`

### ANTLR4 Grammar (Formal Specification)

For reference, here is the complete formal grammar:

\`\`\`
// Lexer
KKEY_IDENTIFIER: 'K' 'X'? [0-9]+;
NUMBER: '-'? [0-9]+ ('.' [0-9]+)?;
STRING: '\\'' ~'\\''* '\\'';
Operators: =, <, <=, >, >=, =~ (regex match)
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
