/**
 * Process-local memo. There is deliberately no database in Assay: a restart
 * re-derives everything from the seed or from the rail, and that is a property
 * worth keeping rather than a limitation to work around.
 */
const cells = new Map<string, unknown>();

export function memo<T>(namespace: string, key: string, make: () => T): T {
  const k = namespace + " " + key;
  if (cells.has(k)) return cells.get(k) as T;
  const value = make();
  cells.set(k, value);
  return value;
}

/** Tests only. Never called on a request path. */
export function clearMemo(): void {
  cells.clear();
}
