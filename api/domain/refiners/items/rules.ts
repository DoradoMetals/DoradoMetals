// What the refinery reported, merged over what it reported before.
//
// `null` IS A REAL VALUE HERE: an unmeasured assay figure IS null, so the
// document is merged over the current row rather than patched into it - null
// means "not measured", not "leave alone". `content` is DERIVED and never
// accepted from a caller.
import type { refiners } from "@dorado/contracts";
import type { ItemPatch, RefinerItemRow } from "#db/refiners/items/repo.ts";

export function assayedRow(
  reportedNow: refiners.items.Patch,
  reportedBefore: RefinerItemRow | undefined,
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
