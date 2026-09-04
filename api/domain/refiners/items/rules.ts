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

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid("the document names no field to write");
  }
}

export function assertScrapLine(
  line: { bullion_id: string | null } | undefined, order_item_id: string
): void {
  if (!line || line.bullion_id !== null) {
    throw new NotFound(
      `order item ${order_item_id} has no scrap line to report assay values on`
    );
  }
}

export function assertRefinerItem<T>(
  row: T | null | undefined, order_item_id: string
): asserts row is T {
  if (!row) throw new NotFound(`order item ${order_item_id} has no refiner row`);
}
