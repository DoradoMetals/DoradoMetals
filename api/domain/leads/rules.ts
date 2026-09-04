// WHAT A LEAD REFUSES (ruling 65). Pure - no database, so the whole of what
// this feature can say no to is readable and testable in one screen.
import { NotFound } from "#shared/errors.ts";

// A missing lead is a 404, not a 200 carrying undefined - the latter reaches
// the client as an empty body, indistinguishable from a lead with no fields.
// The same refusal answers a read of an id that never existed and a write
// whose UPDATE matched nothing, because they are the same fact.
export function assertLead<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no lead ${id}`);
}
