// THE COLUMNS A TABLE HAS, FROM ITS CONTRACT (ruling 64).
//
// Jacob: "Why do we have to reference arrays of columns so much? That
// shouldn't be a thing." A hand-written `["name", "phone", "email", ...]` is a
// SECOND declaration of the table, and the second declaration is the one that
// goes stale - silently, because nothing compares it against the first.
//
// @dorado/contracts generates one schema per table from information_schema, so
// the keys of that schema ARE the columns. Every patch whitelist and every
// RETURNING list derives from one here, and a `.pick()`/`.omit()` says which
// subset in the contract's own vocabulary rather than in a string array a lint
// has to police.
//
// `lint:no-column-arrays` fails a literal string array of column names under
// db/ and domain/, which is what makes this the only spelling left.
import type { ZodObject } from "zod/v4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entity = ZodObject<any>;

/**
 * The column names, in the order the table declares them - as a union of
 * LITERALS, so `(typeof PATCHABLE)[number]` still keys a Pick or a Record and a
 * derived whitelist is as strong a type as a hand-written tuple was.
 */
export function columnsOf<T extends Entity>(
  entity: T
): readonly (keyof T["shape"] & string)[] {
  return Object.keys(entity.shape) as (keyof T["shape"] & string)[];
}

/**
 * A RETURNING list. Pass the entity for every column, or a `.omit({...})` of it
 * for a projection that keeps something off the wire - reviews.reviews' user_id
 * and order_id, every table's created_by_id/updated_by_id.
 */
export function returningOf(entity: Entity): string {
  return Object.keys(entity.shape).join(", ");
}

// The actor ids public.audit_stamp writes (116). They are columns, and no wire
// projection has ever carried them: the DISPLAY names created_by/updated_by are
// what a reader shows. Declared once here so a repo says
// `returningOf(Lead.omit(WIRE_EXCLUDES))` instead of listing two column names
// of its own.
export const ACTOR_IDS = { created_by_id: true, updated_by_id: true } as const;
