import { NotFound } from "#shared/errors.ts";

export function assertAddress<T>(
  row: T | null | undefined, address_id: string
): asserts row is T {
  if (!row) throw new NotFound(`no address ${address_id}`);
}
