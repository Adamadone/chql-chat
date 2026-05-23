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
 * The envelope returned by the MCP `search_measurements` tool.
 *
 * The Convex side splits this: `rows` goes to `metadata.apiResponse` for
 * the UI, everything else becomes the LLM-facing digest.
 */
export interface SearchEnvelope {
  /** Total flattened rows on this page. */
  rowCount: number;
  page: { pageNumber: number; pageSize: number };
  /** Distinct field names observed across rows, in first-seen order. */
  columns: string[];
  /** Per-column aggregates, keyed by column name. */
  aggregates: Record<string, Aggregate>;
  /** Counts of each distinct alarm name across all rows on this page. */
  alarmCounts: Record<string, number>;
  /** First N rows verbatim — included in the LLM digest. */
  sampleFirst: EnvelopeRow[];
  /** Last N rows verbatim — empty when sampleFirst already covers the page. */
  sampleLast: EnvelopeRow[];
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
