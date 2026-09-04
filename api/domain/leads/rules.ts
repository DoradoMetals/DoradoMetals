import { NotFound } from "#shared/errors.ts";

export function assertLead<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no lead ${id}`);
}
