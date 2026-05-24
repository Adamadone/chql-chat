// See ./CONTEXT.md for module overview.
// K0000 isn't unique across characteristics — the same K0000 can appear under
// multiple K2000 for the same piece/timestamp — so we hash the full tuple.

import { createHash } from "node:crypto";

export interface HashResult {
  hash: string;
  isEmpty: boolean;
  rowCount: number;
}

interface Part {
  K1000?: number;
  characteristics?: Characteristic[];
}

interface Characteristic {
  K2000?: number;
  values?: Value[];
}

interface Value {
  K0000?: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function hashResultSet(raw: unknown): HashResult {
  const tuples: Array<[number, number, number]> = [];

  const root = isRecord(raw) ? raw : {};

  // New shape (SearchEnvelope): flattened rows already carry K1000/K2000/K0000.
  if (typeof root.rowCount === "number" && Array.isArray(root.rows)) {
    for (const row of root.rows as Array<Record<string, unknown>>) {
      if (!isRecord(row)) continue;
      const k1000 = typeof row.K1000 === "number" ? row.K1000 : -1;
      const k2000 = typeof row.K2000 === "number" ? row.K2000 : -1;
      const k0000 = typeof row.K0000 === "number" ? row.K0000 : -1;
      tuples.push([k1000, k2000, k0000]);
    }
  } else {
    // Legacy shape: nested parts → characteristics → values (older fixtures, direct API tests).
    const parts = Array.isArray(root.parts) ? (root.parts as Part[]) : [];
    for (const part of parts) {
      const k1000 = typeof part.K1000 === "number" ? part.K1000 : -1;
      const chars = Array.isArray(part.characteristics) ? part.characteristics : [];
      for (const ch of chars) {
        const k2000 = typeof ch.K2000 === "number" ? ch.K2000 : -1;
        const values = Array.isArray(ch.values) ? ch.values : [];
        for (const v of values) {
          const k0000 = typeof v.K0000 === "number" ? v.K0000 : -1;
          tuples.push([k1000, k2000, k0000]);
        }
      }
    }
  }

  tuples.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  });

  const digest = createHash("sha256")
    .update(JSON.stringify(tuples))
    .digest("hex");

  return {
    hash: digest,
    isEmpty: tuples.length === 0,
    rowCount: tuples.length,
  };
}

/** Returns null if the text isn't valid JSON — caller should treat that as an API error. */
export function hashMCPResponseText(text: string): HashResult | null {
  try {
    const parsed = JSON.parse(text);
    return hashResultSet(parsed);
  } catch {
    return null;
  }
}
