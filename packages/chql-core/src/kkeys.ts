/**
 * @module @chql-chat/chql-core/kkeys — K-key extraction and comparison
 *
 * K-keys (`K1001`, `KX123`, etc.) are the identifier vocabulary of CHQL.
 * Eval pipelines extract them from a generated query to compare against
 * the golden set's expected K-keys.
 */
export function extractKkeys(chql: string): string[] {
  const matches = chql.match(/K[X]?\d+/g);
  return matches ? [...new Set(matches)] : [];
}

export function kkeysMatch(actual: string[], expected: string[]): boolean {
  const a = new Set(actual);
  const e = new Set(expected);
  if (a.size !== e.size) return false;
  for (const k of e) if (!a.has(k)) return false;
  return true;
}
