// See ./CONTEXT.md for module overview.
// Produces the SearchEnvelope wire shape consumed by chql-core's types.

import type {
  EnvelopeRow as Row,
  NumericAggregate,
  CategoricalAggregate,
  Aggregate,
  SearchEnvelope,
  CharacteristicSummary,
  PartSummary,
  MeasurementEventSample,
} from "@chql-chat/chql-core";

export type {
  Row,
  NumericAggregate,
  CategoricalAggregate,
  Aggregate,
  SearchEnvelope,
  CharacteristicSummary,
  PartSummary,
  MeasurementEventSample,
};

// ─── Constants ───────────────────────────────────────────────────────────────

// All three are LLM-context bounds: keep digest tiny.
const SAMPLE_SIZE = 5;
const TOP_CATEGORICAL_VALUES = 10;
const SAMPLE_MEASUREMENT_EVENTS = 3;

// ─── Type Guards ─────────────────────────────────────────────────────────────

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Scalar (non-array, non-object) K-key fields from an entity, minus child collections. */
function scalarKkeys(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === "characteristics" || key === "values" || key === "alarms") continue;
    if (value === null || typeof value !== "object") {
      out[key] = value;
    }
  }
  return out;
}

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

/** One row per leaf value, parent K-keys merged in. Child fields win on collision. */
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

// Per-column aggregate; alarms are summarised separately via computeAlarmCounts.
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

/** Union of field names across rows in first-seen order. */
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

// ─── Pivot Summary ───────────────────────────────────────────────────────────
// Re-derives (part, characteristic, event) identity from K-keys on each flat row
// — no parent pointer survives flattenAqdef. Identity rules:
//   part: K1000 → K1001 → "_unknown"
//   characteristic: K2000 → K2001 → "_unknown"
//   event: K0000 (shared across characteristics taken at the same event)

function stringifyKey(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function partKeyOf(row: Row): string {
  const k1000 = row.K1000;
  if (k1000 !== undefined && k1000 !== null) return `1000:${stringifyKey(k1000)}`;
  const k1001 = row.K1001;
  if (k1001 !== undefined && k1001 !== null) return `1001:${stringifyKey(k1001)}`;
  return "_unknown";
}

function charKeyOf(row: Row): string {
  const k2000 = row.K2000;
  if (k2000 !== undefined && k2000 !== null) return `2000:${stringifyKey(k2000)}`;
  const k2001 = row.K2001;
  if (k2001 !== undefined && k2001 !== null) return `2001:${stringifyKey(k2001)}`;
  return "_unknown";
}

function scalarOrUndefined(
  v: unknown,
): number | string | undefined {
  if (typeof v === "number" || typeof v === "string") return v;
  return undefined;
}

// Single pass producing partsOnPage, measurementCount, and the first N pivoted events.
function computePivotSummary(rows: Row[]): {
  partsOnPage: PartSummary[];
  measurementCount: number;
  sampleMeasurements: MeasurementEventSample[];
} {
  interface PartAcc {
    summary: PartSummary;
    charIndex: Map<string, number>;
  }
  const parts = new Map<string, PartAcc>();
  const seenMeasurements = new Set<string>();
  // Stop building events after SAMPLE_MEASUREMENT_EVENTS distinct (partKey + K0000).
  const pivotedEvents = new Map<string, MeasurementEventSample>();

  for (const row of rows) {
    const pKey = partKeyOf(row);
    let part = parts.get(pKey);
    if (!part) {
      part = {
        summary: {
          partKey: pKey,
          K1000: scalarOrUndefined(row.K1000),
          K1001: typeof row.K1001 === "string" ? row.K1001 : scalarOrUndefined(row.K1001) !== undefined ? String(row.K1001) : undefined,
          K1002: typeof row.K1002 === "string" ? row.K1002 : undefined,
          K1003: typeof row.K1003 === "string" ? row.K1003 : undefined,
          K1008: typeof row.K1008 === "string" ? row.K1008 : undefined,
          measurementCount: 0,
          valueCount: 0,
          characteristics: [],
        },
        charIndex: new Map(),
      };
      parts.set(pKey, part);
    }

    part.summary.valueCount += 1;

    const cKey = charKeyOf(row);
    let cIdx = part.charIndex.get(cKey);
    if (cIdx === undefined) {
      cIdx = part.summary.characteristics.length;
      part.charIndex.set(cKey, cIdx);
      part.summary.characteristics.push({
        K2000: scalarOrUndefined(row.K2000),
        K2001: typeof row.K2001 === "string" ? row.K2001 : scalarOrUndefined(row.K2001) !== undefined ? String(row.K2001) : undefined,
        K2002: typeof row.K2002 === "string" ? row.K2002 : undefined,
        K2142: typeof row.K2142 === "string" ? row.K2142 : undefined,
        valueCount: 0,
      });
    }
    part.summary.characteristics[cIdx].valueCount += 1;

    // Rows missing K0000 still count toward valueCount but can't be pivoted.
    const k0000 = row.K0000;
    if (k0000 === undefined || k0000 === null) continue;
    const eventKey = `${pKey}|${stringifyKey(k0000)}`;
    if (!seenMeasurements.has(eventKey)) {
      seenMeasurements.add(eventKey);
      part.summary.measurementCount += 1;
    }

    if (pivotedEvents.size < SAMPLE_MEASUREMENT_EVENTS || pivotedEvents.has(eventKey)) {
      let evt = pivotedEvents.get(eventKey);
      if (!evt) {
        evt = {
          K0000: k0000 as number | string,
          K0004: typeof row.K0004 === "string" ? row.K0004 : undefined,
          partKey: pKey,
          K1001: part.summary.K1001,
          K1002: part.summary.K1002,
          values: {},
        };
        pivotedEvents.set(eventKey, evt);
      }
      const charLabel =
        typeof row.K2002 === "string" && row.K2002.length > 0
          ? row.K2002
          : typeof row.K2001 === "string"
            ? `K2001=${row.K2001}`
            : cKey;
      evt.values[charLabel] = row.K0001;
    }
  }

  return {
    partsOnPage: Array.from(parts.values(), (p) => p.summary),
    measurementCount: seenMeasurements.size,
    sampleMeasurements: Array.from(pivotedEvents.values()),
  };
}

// ─── Envelope Builder ────────────────────────────────────────────────────────

/** Build the SearchEnvelope from one page of raw aqdef-json. */
export function buildEnvelope(
  raw: unknown,
  pageNumber: number,
  pageSize: number,
): SearchEnvelope {
  const rows = flattenAqdef(raw);
  const columns = deriveColumns(rows);
  const aggregates = computeAggregates(rows, columns);
  const alarmCounts = computeAlarmCounts(rows);
  const { partsOnPage, measurementCount, sampleMeasurements } =
    computePivotSummary(rows);

  // sampleLast empty when sampleFirst already covers the page (avoid duplicates).
  const sampleFirst = rows.slice(0, SAMPLE_SIZE);
  const sampleLast =
    rows.length > 2 * SAMPLE_SIZE ? rows.slice(-SAMPLE_SIZE) : [];

  return {
    rowCount: rows.length,
    measurementCount,
    page: { pageNumber, pageSize },
    columns,
    aggregates,
    alarmCounts,
    partsOnPage,
    sampleFirst,
    sampleLast,
    sampleMeasurements,
    rows,
  };
}
