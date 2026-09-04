// WHAT THE REFINER ENGAGEMENT REFUSES (ruling 65). Pure - no database.
import { Invalid, NotFound } from "#shared/errors.ts";

// An all-optional schema cannot say "name at least one field", so the RULE
// says it: an empty document is a write that would change nothing and report
// success.
export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
}

// Every order is born with an engagement (093's invariant), so a miss here is
// an id that names no refiner order at all - the same fact before the write
// and after it.
export function assertRefinerOrder<T>(
  row: T | null | undefined, id: string
): asserts row is T {
  if (!row) throw new NotFound(`no refiner order ${id}`);
}
