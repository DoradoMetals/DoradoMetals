export type Baseline = { from: string; through: string };

export type MigrationFile = { name: string };

export function parseBaseline(sql: string): Baseline | null {
  const m = sql.match(/^\s*--\s*baseline:\s*(\d+)-(\d+)/m);
  return m ? { from: m[1], through: m[2] } : null;
}

export function coveredBy<T extends MigrationFile>(
  baseline: Baseline | null,
  self: string,
  files: readonly T[],
  applied: ReadonlySet<string> = new Set<string>()
): T[] {
  if (!baseline) return [];
  const { from, through } = baseline;
  return files.filter((f) => {
    if (f.name === self) return false;
    if (applied.has(f.name)) return false;
    const num = f.name.slice(0, from.length);
    return /^\d+$/.test(num) && num >= from && num <= through;
  });
}
