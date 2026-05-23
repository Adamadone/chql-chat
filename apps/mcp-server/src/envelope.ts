/**
 * @module envelope — Flatten + aggregate aqdef-json into a context-friendly envelope
 *
 * The chy.stat API returns measurement data in a hierarchical shape:
 *
 *   { parts: [
 *       { K1000, ...K1xxx, characteristics: [
 *           { K2000, ...K2xxx, values: [
 *               { K0000, K0001, K0004, ...K0xxx, alarms?: [...] }
 *           ] }
 *       ] }
 *   ] }
 *
 * Returning that raw structure to the LLM blows the 200K-token context window
 * on broad queries (1000 rows × ~1.5KB each). Two channels need different
 * representations:
 *
 *   - LLM: small **digest** = aggregates + samples (~ tens of rows worth of text)
 *   - UI:  full **rows** = every leaf value flattened with its parent K-keys
 *
 * This module produces a single {@link SearchEnvelope} carrying both. The
 * Convex side ({@link callMCPTool}) splits the envelope before feeding back
 * to the LLM: only `rows` is omitted from the model's tool-result message.
 *
 * Aggregates are computed deterministically in JS over the entire page (not
 * sampled), so analytical questions like "average K1001" are answered from
 * the digest without the model ever seeing all rows.
 */

// ─── Types ───────────────────────────────────────────────────────────────────
//
// Wire types are defined in @chql-chat/chql-core/envelope so the Convex
// consumer + the eval harness share one source of truth. We re-export them
// here for local convenience.

import type {
  EnvelopeRow as Row,
  NumericAggregate,
  CategoricalAggregate,
  Aggregate,
  SearchEnvelope,
} from "@chql-chat/chql-core";

export type { Row, NumericAggregate, CategoricalAggregate, Aggregate, SearchEnvelope };

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of rows to include in `sampleFirst` / `sampleLast`. Kept small to bound LLM context. */
const SAMPLE_SIZE = 5;

/** Maximum number of top values to report in a categorical aggregate. */
const TOP_CATEGORICAL_VALUES = 10;

// ─── Type Guards ─────────────────────────────────────────────────────────────

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Extract every scalar (non-array, non-object) K-key field from an entity record. */
function scalarKkeys(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    // Skip child-collection fields (handled by the recursion) and any
    // non-K-key bookkeeping fields the upstream might attach.
    if (key === "characteristics" || key === "values" || key === "alarms") continue;
    // Keep scalars (number, string, boolean, null). Skip nested objects/arrays.
    if (value === null || typeof value !== "object") {
      out[key] = value;
    }
  }
  return out;
}

/** Pull an array of alarm names from a value record, if present. */
function extractAlarms(value: Record<string, unknown>): string[] | undefined {
  const raw = value.alarms;
  if (!Array.isArray(raw)) return undefined;
  const names: string[] = [];
  for (const a of raw) {
    if (typeof a === "string") {
      names.push(a);
    } else if (isRecord(a) && typeof a.name === "string") {
      names.push(a.name);
    }
  }
  return names.length > 0 ? names : undefined;
}

// ─── Flattening ──────────────────────────────────────────────────────────────

/**
 * Walk the aqdef-json tree and produce one row per leaf `value`, with the
 * parent part and characteristic scalar K-keys merged in.
 *
 * Field-collision rule: child fields win over parent fields. In practice K0xxx,
 * K2xxx, K1xxx don't collide, but if the upstream ever puts the same key at
 * multiple levels, the closest-to-leaf wins (consistent with "this measurement
 * value's view of the world").
 */
export function flattenAqdef(raw: unknown): Row[] {
  const rows: Row[] = [];
  if (!isRecord(raw)) return rows;
  const parts = Array.isArray(raw.parts) ? raw.parts : [];

  for (const part of parts) {
    if (!isRecord(part)) continue;
    const partKeys = scalarKkeys(part);
    const characteristics = Array.isArray(part.characteristics)
      ? part.characteristics
      : [];

    for (const ch of characteristics) {
      if (!isRecord(ch)) continue;
      const charKeys = scalarKkeys(ch);
      const values = Array.isArray(ch.values) ? ch.values : [];

      for (const v of values) {
        if (!isRecord(v)) continue;
        const valueKeys = scalarKkeys(v);
        const alarms = extractAlarms(v);

        const row: Row = { ...partKeys, ...charKeys, ...valueKeys };
        if (alarms) row.alarms = alarms;
        rows.push(row);
      }
    }
  }

  return rows;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Determine whether every non-null entry in `values` is finite-numeric.
 * Used to decide whether a column is numeric or categorical.
 */
function isNumericColumn(values: unknown[]): values is number[] {
  if (values.length === 0) return false;
  return values.every(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
}

function computeNumericAggregate(
  values: number[],
  nullCount: number,
): NumericAggregate {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) {
    const d = v - mean;
    variance += d * d;
  }
  variance = values.length > 0 ? variance / values.length : 0;
  return {
    type: "numeric",
    count: values.length,
    nullCount,
    min,
    max,
    mean,
    stddev: Math.sqrt(variance),
  };
}

function computeCategoricalAggregate(
  values: unknown[],
  nullCount: number,
): CategoricalAggregate {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = typeof v === "string" ? v : JSON.stringify(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const topValues = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORICAL_VALUES)
    .map(([value, count]) => ({ value, count }));
  return {
    type: "categorical",
    count: values.length,
    nullCount,
    distinctCount: counts.size,
    topValues,
  };
}

/**
 * For each column, classify and compute one {@link Aggregate}. Skips the
 * `alarms` column — alarms are summarized separately via {@link computeAlarmCounts}.
 */
function computeAggregates(rows: Row[], columns: string[]): Record<string, Aggregate> {
  const out: Record<string, Aggregate> = {};
  for (const col of columns) {
    if (col === "alarms") continue;
    const nonNull: unknown[] = [];
    let nullCount = 0;
    for (const row of rows) {
      const v = row[col];
      if (v === null || v === undefined) {
        nullCount++;
      } else {
        nonNull.push(v);
      }
    }
    if (nonNull.length === 0) {
      out[col] = {
        type: "categorical",
        count: 0,
        nullCount,
        distinctCount: 0,
        topValues: [],
      };
      continue;
    }
    if (isNumericColumn(nonNull)) {
      out[col] = computeNumericAggregate(nonNull, nullCount);
    } else {
      out[col] = computeCategoricalAggregate(nonNull, nullCount);
    }
  }
  return out;
}

/** Tally alarm-name occurrences across every row's `alarms` array. */
function computeAlarmCounts(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const alarms = row.alarms;
    if (!Array.isArray(alarms)) continue;
    for (const a of alarms) {
      if (typeof a !== "string") continue;
      out[a] = (out[a] ?? 0) + 1;
    }
  }
  return out;
}

/** Stable union of all field names that appear in any row. */
function deriveColumns(rows: Row[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }
  return order;
}

// ─── Envelope Builder ────────────────────────────────────────────────────────

/**
 * Build the {@link SearchEnvelope} from the raw chy.stat aqdef-json response
 * for one page. Flattening + aggregation happens here, server-side, so the
 * Convex action receives a context-friendly digest already.
 */
export function buildEnvelope(
  raw: unknown,
  pageNumber: number,
  pageSize: number,
): SearchEnvelope {
  const rows = flattenAqdef(raw);
  const columns = deriveColumns(rows);
  const aggregates = computeAggregates(rows, columns);
  const alarmCounts = computeAlarmCounts(rows);

  // sampleLast is empty when sampleFirst already covers the whole page, to
  // avoid duplicating rows in the LLM's view.
  const sampleFirst = rows.slice(0, SAMPLE_SIZE);
  const sampleLast =
    rows.length > 2 * SAMPLE_SIZE ? rows.slice(-SAMPLE_SIZE) : [];

  return {
    rowCount: rows.length,
    page: { pageNumber, pageSize },
    columns,
    aggregates,
    alarmCounts,
    sampleFirst,
    sampleLast,
    rows,
  };
}
