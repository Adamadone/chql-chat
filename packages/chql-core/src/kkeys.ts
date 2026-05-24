// See ./CONTEXT.md for module overview.
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
