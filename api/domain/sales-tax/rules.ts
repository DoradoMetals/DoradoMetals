// WHAT THE TAX SURFACE REFUSES (ruling 65). Pure - no database.
import { NotFound } from "#shared/errors.ts";

// An address id that names nothing is a 404 rather than a silent zero: taxed
// in no state and "we could not find the state you named" are the same number
// and different facts, and only one of them is a customer being undercharged.
export function assertAddress<T>(
  row: T | null | undefined, address_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no address ${address_id}`);
}
