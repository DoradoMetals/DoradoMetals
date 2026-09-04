// What the refinery reported, merged over what it reported before.
//
// `null` IS A REAL VALUE HERE: an unmeasured assay figure IS null, so the
// document is merged over the current row rather than patched into it - null
// means "not measured", not "leave alone". `content` is DERIVED and never
// accepted from a caller.
import { Invalid, NotFound } from "#shared/errors.ts";
import type { RefinerItemPatch, RefinerItem } from "@dorado/contracts";
import type { ItemPatch } from "#db/refiners/items/repo.ts";

export function assayedRow(
  reportedNow: RefinerItemPatch,
  reportedBefore: RefinerItem | undefined,
  declaredUnit: string | null,
  contentOf: (weight: number | null, unit: string | null, purity: number | null) => number | null
): ItemPatch {
  const pre_melt = reportedNow.pre_melt !== undefined
    ? reportedNow.pre_melt : (reportedBefore?.pre_melt ?? null);
  const post_melt = reportedNow.post_melt !== undefined
    ? reportedNow.post_melt : (reportedBefore?.post_melt ?? null);
  const purity = reportedNow.purity !== undefined
    ? reportedNow.purity : (reportedBefore?.purity ?? null);
  const unit = reportedNow.unit !== undefined
    ? reportedNow.unit : (reportedBefore?.unit ?? declaredUnit);

  return {
    pre_melt, post_melt, purity, unit,
    content: contentOf(post_melt ?? pre_melt, unit, purity),
  };
}

// ----------------------------------------------------------------- refusals
//
// RULING 65: the use case states the happy path and calls one of these.

// An all-optional schema cannot say "name at least one field", so the RULE
// says it: an empty document is a write that would change nothing and report
// success.
export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
}

// THE ASSAY REPORT IS A SCRAP FACT. A bullion line's weight and purity are the
// catalogue's, snapshotted when the line was created (ruling 51); a refinery
// reporting against one would be reporting against a coin.
export function assertScrapLine(
  line: { bullion_id: string | null } | undefined, order_item_id: string
): void {
  if (!line || line.bullion_id !== null) {
    throw new NotFound(
      `order item ${order_item_id} has no scrap line to report assay values on`
    );
  }
}

// Every customer line is born with a counterpart (093's invariant), so a
// missing one is an order item that is not on a refiner order at all.
export function assertRefinerItem<T>(
  row: T | null | undefined, order_item_id: string
): asserts row is T {
  if (!row) throw new NotFound(`order item ${order_item_id} has no refiner row`);
}
