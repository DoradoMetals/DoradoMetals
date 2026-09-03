// ONE dynamic UPDATE, built the same way everywhere.
//
// THE TWO SHAPES THIS REPLACES, AND WHY ONE OF THEM WAS WRONG.
//
// Batch 1 (leads, reviews, rates) wrote a static statement of
// `col = COALESCE($n, col)` per patchable column. It reads well and it cannot
// express one thing a caller genuinely needs: CLEARING a nullable column.
// COALESCE receives null for "the caller did not mention this column" and for
// "the caller wants this column emptied", and it resolves both to "leave it".
// rates.rates.max_qty is the live casualty - null means an open-ended band, and
// the only way to set it today is to delete the band and make a new one, which
// that repo's own header records as a known limit.
//
// Batch 2 (places/addresses, and orders before it) built the SET list from the
// keys PRESENT in the patch object. A key that is absent is not written at all;
// a key present with the value null clears the column. That distinction is the
// whole point, and it is what an HTTP PATCH means.
//
// *** `undefined` COUNTS AS ABSENT, AND THAT IS NOT A DETAIL. *** `key in obj`
// is true for `{ label: undefined }`, and every controller that maps a request
// body writes exactly that - `label: body.label as string | undefined` names
// all four columns whether or not the caller sent any of them. Treating those
// as "clear this column" made an admin toggling one flag blank the other three,
// which on fulfillments.methods is a NOT NULL violation and a 500, and on a
// nullable column would have been silent data loss. So a value of `undefined`
// is a column the caller did not mention; only an explicit `null` clears.
//
// So this is batch 2's shape, extracted. The COALESCE files it replaces are
// deleted rather than kept beside it.
//
// UNKNOWN KEYS THROW. The allowed list is the whitelist, and a key outside it
// is a programming error caught here rather than a column name reaching SQL -
// the SET list is interpolated, so this is also the boundary that keeps request
// data out of the statement text. Values are always parameters; only names from
// `allowed` are ever concatenated.
//
// THE AUDIT COLUMNS ARE NOT ANYONE'S TO LIST. `updated_at`, `updated_by` and
// `updated_by_id` are written by the public.audit_stamp trigger (migration 116)
// on every UPDATE this builds. Putting one in `allowed` is refused for the same
// reason an unknown key is: it would be a second author for a column that now
// has exactly one.

// Written by the trigger, never by a caller. See migration 116.
const STAMPED = new Set([
  "created_at", "updated_at", "created_by", "updated_by",
  "created_by_id", "updated_by_id",
]);

export type UpdateSpec = {
  /** Schema-qualified table name, e.g. "leads.leads". */
  table: string;
  /** The columns a caller may change. Anything else in `patch` throws. */
  allowed: readonly string[];
  /** The caller's patch. Keys present are written; keys absent are untouched. */
  patch: Record<string, unknown>;
  /**
   * The WHERE, as column/value pairs ANDed together - `{ id }` for the usual
   * case, `{ address_id, user_id }` where ownership is part of the key. A guard
   * belongs here, not in the patch.
   */
  where: Record<string, unknown>;
  /** Postgres type to cast a parameter to, by column - `{ direction: "orders.direction" }`. */
  casts?: Record<string, string>;
  /** The RETURNING list, if the caller wants one. */
  returning?: string;
};

/**
 * Builds the statement, or returns null when the patch names no allowed column
 * - which is not an error and not an empty UPDATE: the caller decides whether
 * "nothing to change" means true, the id, or a read-back.
 *
 *   const built = buildUpdate({ table: "leads.leads", allowed: PATCHABLE, patch, where: { id } });
 *   if (!built) return true;
 *   const { rowCount } = await query(built.text, built.values, executor);
 */
export function buildUpdate(spec: UpdateSpec): { text: string; values: unknown[] } | null {
  const { table, allowed, patch, where, casts = {}, returning } = spec;

  for (const key of Object.keys(patch)) {
    if (STAMPED.has(key)) {
      throw new Error(
        `${table}: "${key}" is written by the audit_stamp trigger, not by a patch`
      );
    }
    if (!allowed.includes(key)) {
      throw new Error(`${table}: "${key}" is not a patchable column`);
    }
  }

  const cols = allowed.filter((c) => c in patch && patch[c] !== undefined);
  if (cols.length === 0) return null;

  const values: unknown[] = [];
  const cast = (col: string): string => (casts[col] ? `::${casts[col]}` : "");
  const bind = (col: string, value: unknown): string => {
    values.push(value);
    return `$${values.length}${cast(col)}`;
  };

  const sets = cols.map((c) => `${c} = ${bind(c, patch[c])}`);
  const wheres = Object.entries(where).map(([c, v]) => `${c} = ${bind(c, v)}`);
  if (wheres.length === 0) {
    throw new Error(`${table}: an UPDATE with no WHERE would rewrite every row`);
  }

  const text =
    `UPDATE ${table} SET ${sets.join(", ")}\n WHERE ${wheres.join(" AND ")}` +
    (returning ? `\n RETURNING ${returning}` : "");

  return { text, values };
}
