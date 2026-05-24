// See ./CONTEXT.md for module overview.

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

/** Per-characteristic summary inside a part — drives the pivoted table's K2xxx columns. */
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

/** Per-part summary on the current page — one per distinct part (K1000, else K1001). */
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

/** One pivoted measurement event — the UI's row unit and the LLM's cardinality unit. */
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
 * Envelope returned by the MCP `search_measurements` tool. Convex splits this:
 * `rows` → `metadata.apiResponse` for the UI; the rest becomes the LLM digest.
 *
 * `rowCount` and `measurementCount` are different units (see the field docs).
 * Neither is a total — chy.stat does not surface a result total.
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

/** LLM-facing slice of the envelope — same shape, no `rows`. */
export type SearchEnvelopeDigest = Omit<SearchEnvelope, "rows">;

/**
 * Returns null if the text isn't JSON or lacks the envelope shape — callers
 * pass through unchanged (legacy aqdef-json, error payloads, etc).
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
  // Back-compat with pre-pivot envelopes: missing fields → zero-ish defaults; UI degrades to a flat view.
  const e = obj as Record<string, unknown>;
  if (typeof e.measurementCount !== "number") e.measurementCount = 0;
  if (!Array.isArray(e.partsOnPage)) e.partsOnPage = [];
  if (!Array.isArray(e.sampleMeasurements)) e.sampleMeasurements = [];
  return obj as unknown as SearchEnvelope;
}

/** Split an envelope into the LLM digest (no `rows`) and the rows array. */
export function splitEnvelope(envelope: SearchEnvelope): {
  digest: SearchEnvelopeDigest;
  rows: EnvelopeRow[];
} {
  const { rows, ...digest } = envelope;
  return { digest, rows };
}
