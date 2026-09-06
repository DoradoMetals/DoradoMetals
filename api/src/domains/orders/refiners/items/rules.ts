import { Invalid, NotFound } from '#shared/errors.ts'
import { WeightUnit } from '@dorado/contracts'
import type { OrderItem, RefinerItemPatch, RefinerItem } from '@dorado/contracts'
import type { ItemPatch } from '#db/refiners/items/repo.ts'

export function reportsAnAssay(patch: RefinerItemPatch): boolean {
  return (
    patch.pre_melt !== undefined ||
    patch.post_melt !== undefined ||
    patch.purity !== undefined ||
    patch.unit !== undefined
  )
}

export function assayedRow(
  reportedNow: RefinerItemPatch,
  reportedBefore: RefinerItem | undefined,
  declaredUnit: string | null
): ItemPatch {
  const pre_melt =
    reportedNow.pre_melt !== undefined ? reportedNow.pre_melt : (reportedBefore?.pre_melt ?? null)
  const post_melt =
    reportedNow.post_melt !== undefined
      ? reportedNow.post_melt
      : (reportedBefore?.post_melt ?? null)
  const purity =
    reportedNow.purity !== undefined ? reportedNow.purity : (reportedBefore?.purity ?? null)
  const unit =
    reportedNow.unit !== undefined ? reportedNow.unit : (reportedBefore?.unit ?? declaredUnit)

  return { pre_melt, post_melt, purity, unit }
}

// refiners.items already holds rows with a NULL unit, and the JavaScript that
// used to derive their content threw a TypeError on one and valued every
// unrecognised unit at zero fine ounces (MA F4). Both are refused here.
export function assertWeighable(
  unit: string | null | undefined,
  weight: number | null | undefined,
  purity: number | null | undefined
): void {
  if (weight === null || weight === undefined) return
  if (purity === null || purity === undefined) return
  if (!WeightUnit.safeParse(typeof unit === 'string' ? unit.toLowerCase() : unit).success) {
    throw new Invalid(
      `an assay weighed in ${unit === null || unit === undefined ? 'no unit' : `"${unit}"`} ` +
        `cannot be valued - the business quotes in ${WeightUnit.options.join(', ')}`
    )
  }
}

export function assertNamesAField(patch: object): void {
  if (Object.keys(patch).length === 0) {
    throw new Invalid('the document names no field to write')
  }
}

export function assertScrapLine(
  line: Pick<OrderItem, 'bullion_id'> | undefined,
  order_item_id: string
): void {
  if (!line || line.bullion_id !== null) {
    throw new NotFound(`order item ${order_item_id} has no scrap line to report assay values on`)
  }
}

export function assertContentDerived(derived: boolean, order_item_id: string): void {
  if (!derived) {
    throw new Error(
      `order item ${order_item_id}: the assayed content was not derived - this ` +
        `transaction must not commit`
    )
  }
}

export function assertRefinerItem<T>(
  row: T | null | undefined,
  order_item_id: string
): asserts row is T {
  if (!row) throw new NotFound(`order item ${order_item_id} has no refiner row`)
}
