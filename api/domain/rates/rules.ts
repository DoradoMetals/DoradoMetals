// WHAT A RATE REFUSES (ruling 65). Pure - no database.
import { NotFound } from "#shared/errors.ts";

// A read of an id that never existed and a write whose UPDATE matched nothing
// are the same fact, so they are the same refusal.
export function assertRate<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no rate ${id}`);
}

// NOT a refusal - a FAULT, and deliberately a plain Error (500, generic
// message, the real one in the log): the metal a band names is reference data
// this API owns, so a band pointing at a metal that is gone is our broken row,
// not the caller's bad request. The LIST reads drop such a band rather than
// letting an undefined name reach the pricing path; a read of ONE band cannot
// drop it and say nothing.
export function assertMetalName(
  name: string | undefined, rate_id: string
): asserts name is string {
  if (name === undefined) {
    throw new Error(`rate ${rate_id} names a metal that does not exist`);
  }
}
