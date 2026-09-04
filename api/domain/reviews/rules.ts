// WHAT A REVIEW REFUSES (ruling 65). Pure - no database.
import { NotFound } from "#shared/errors.ts";

// One refusal for one fact: a read of an id that never existed and a write
// whose UPDATE matched nothing both mean the review is not there.
export function assertReview<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no review ${id}`);
}
