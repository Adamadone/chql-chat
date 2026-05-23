/**
 * @module @chql-chat/chql-core/envelope — Wire types for the search_measurements envelope
 *
 * Both the MCP server (producer) and the Convex action / web UI (consumers)
 * agree on this shape. Centralising it here prevents the two sides from
 * drifting and gives the UI/eval a clean type to consume.
 *
 * Why split LLM vs UI: a single broad CHQL query can return 1000 rows of
 * ~1.5KB each, which overflows the 200K-token model context when re-fed as
 * a tool result on the next step. The MCP server wraps every response in
 * this envelope. The Convex tool-result splitter then strips `rows` before
 * the LLM sees it, while the full envelope (including `rows`) is persisted
 * to `messages.metadata.apiResponse` for the UI table.
 *
 * Aggregates are deterministic JS computations over the entire page (not
 * sampled), so analytical questions like "average K0001" are answered from
 * the digest alone without the model ever seeing all rows.
 */

/** A single flattened measurement: every K-key field from value + char + part levels. */
export interface EnvelopeRow {
  [field: string]: unknown;
}

/** Numeric column summary — emitted when every non-null entry is finite-numeric. */
export interface NumericAggregate {
  type: "numeric";
  count: number;
  nullCount: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
}

/** Categorical column summary — top-N most frequent values. */
export interface CategoricalAggregate {
  type: "categorical";
  count: number;
  nullCount: number;
  distinctCount: number;
  topValues: Array<{ value: string; count: number }>;
}

export type Aggregate = NumericAggregate | CategoricalAggregate;

/**
 * Per-characteristic summary inside a part. Lets the LLM (and the UI's
 * pivot caption) know what K2xxx columns the pivoted table will have for
 * a given part without scanning rows itself.
 */
export interface CharacteristicSummary {
  /** Stable identity within the part — chy.stat's char DB id when present. */
  K2000?: number | string;
  /** Characteristic number (e.g. "10"). */
  K2001?: string;
  /** Human label (e.g. "filling_value"). Used as the pivot column header. */
  K2002?: string;
  /** Unit suffix (e.g. "l", "°C"). */
  K2142?: string;
  /** How many flattened value rows on this page belong to this characteristic. */
  valueCount: number;
}

/**
 * Per-part summary on the current page. One entry per distinct part (grouped
 * by K1000 if present, else K1001). Carries the caption fields the UI shows
 * above each pivoted table, and the characteristic list that becomes the
 * column set for that part.
 */
export interface PartSummary {
  /** Stable identity used for grouping (K1000 when present, else K1001). */
  partKey: string;
  K1000?: number | string;
  K1001?: string;
  K1002?: string;
  K1003?: string;
  K1008?: string;
  /** Distinct K0000 measurement events for this part on this page. */
  measurementCount: number;
  /** Total flattened value rows for this part on this page. */
  valueCount: number;
  /** Characteristics observed for this part, in first-seen order. */
  characteristics: CharacteristicSummary[];
}

/**
 * One pivoted measurement event — the unit the user sees in the UI table
 * and the unit the LLM should reason about when describing cardinality.
 *
 * Cells are keyed by `K2002` characteristic label so the LLM can reference
 * them by their human name in prose.
 */
export interface MeasurementEventSample {
  K0000: number | string;
  K0004?: string;
  partKey: string;
  K1001?: string;
  K1002?: string;
  /** Characteristic-label → measured value (K0001). */
  values: Record<string, unknown>;
}

/**
 * The envelope returned by the MCP `search_measurements` tool.
 *
 * The Convex side splits this: `rows` goes to `metadata.apiResponse` for
 * the UI, everything else becomes the LLM-facing digest.
 *
 * Cardinality fields — read them carefully:
 *   - `rowCount` = flattened *value* rows on this page (matches chy.stat's
 *     `pageSize` unit). A measurement event with N characteristics expands
 *     into N rows.
 *   - `measurementCount` = distinct K0000 measurement events on this page.
 *     This is the unit the UI table renders one row per, and the unit the
 *     LLM should use when telling the user "we got N results".
 *   - Neither is a total. chy.stat does not surface a total result count.
 */
export interface SearchEnvelope {
  /** Total flattened *value* rows on this page (== chy.stat's pageSize unit). */
  rowCount: number;
  /** Distinct K0000 measurement events on this page (the UI's row unit). */
  measurementCount: number;
  page: { pageNumber: number; pageSize: number };
  /** Distinct field names observed across rows, in first-seen order. */
  columns: string[];
  /** Per-column aggregates, keyed by column name. */
  aggregates: Record<string, Aggregate>;
  /** Counts of each distinct alarm name across all rows on this page. */
  alarmCounts: Record<string, number>;
  /** Parts on this page with their characteristic sets and per-part counts. */
  partsOnPage: PartSummary[];
  /** First N rows verbatim — included in the LLM digest. */
  sampleFirst: EnvelopeRow[];
  /** Last N rows verbatim — empty when sampleFirst already covers the page. */
  sampleLast: EnvelopeRow[];
  /** A few pivoted measurement events for the LLM (matches what the user sees). */
  sampleMeasurements: MeasurementEventSample[];
  /** Full flattened rows for this page. Stripped from the LLM digest. */
  rows: EnvelopeRow[];
}

/**
 * The slice of the envelope that goes to the LLM as a tool result. `rows`
 * is omitted; the rest is preserved so the model has counts, aggregates,
 * and small first/last samples to reason over.
 */
export type SearchEnvelopeDigest = Omit<SearchEnvelope, "rows">;

/**
 * Best-effort parse of an MCP tool-result text into a SearchEnvelope.
 * Returns null if the text isn't JSON or lacks the expected shape. Callers
 * should treat null as "the response is not an envelope (e.g. legacy raw
 * aqdef-json, or an error payload)" and pass it through unchanged.
 */
export function parseSearchEnvelope(text: string): SearchEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.rowCount !== "number" ||
    !Array.isArray(obj.rows) ||
    !Array.isArray(obj.columns) ||
    typeof obj.aggregates !== "object" ||
    obj.aggregates === null
  ) {
    return null;
  }
  // Back-compat: tolerate envelopes from older mcp-server builds that don't
  // carry the pivot fields yet by filling in zero-ish defaults. The UI and
  // LLM will simply see "0 measurements / no parts" and degrade to a flat view.
  const e = obj as Record<string, unknown>;
  if (typeof e.measurementCount !== "number") e.measurementCount = 0;
  if (!Array.isArray(e.partsOnPage)) e.partsOnPage = [];
  if (!Array.isArray(e.sampleMeasurements)) e.sampleMeasurements = [];
  return obj as unknown as SearchEnvelope;
}

/**
 * Split an envelope into the LLM-facing digest (no `rows`) and the rows array.
 * Used by the Convex tool-result splitter.
 */
export function splitEnvelope(envelope: SearchEnvelope): {
  digest: SearchEnvelopeDigest;
  rows: EnvelopeRow[];
} {
  const { rows, ...digest } = envelope;
  return { digest, rows };
}
