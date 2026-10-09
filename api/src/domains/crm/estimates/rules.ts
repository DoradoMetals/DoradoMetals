import { Invalid, NotFound } from '#shared/errors.ts'
import type { EstimateItemPatch } from '@dorado/contracts'

export function assertLead<T>(row: T | null | undefined, lead_id: string): asserts row is T {
  if (!row) throw new NotFound(`no lead ${lead_id}`)
}

export function assertItem<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no estimate item ${id}`)
}

export function assertOnePurity(purity_id: string | null, custom_purity: number | null): void {
  if ((purity_id === null) === (custom_purity === null)) {
    throw new Invalid(
      'an estimate item carries exactly one of purity_id or custom_purity, never both and never neither'
    )
  }
}

export function assertCreatable(patch: EstimateItemPatch): void {
  if (!patch.kind_id) throw new Invalid('an estimate item needs a kind_id')
  if (!patch.metal_id) throw new Invalid('an estimate item needs a metal_id')
  if (!patch.unit_id) throw new Invalid('an estimate item needs a unit_id')
  if (patch.weight === undefined) throw new Invalid('an estimate item needs a weight')
  if (patch.weight <= 0) throw new Invalid('an estimate item weighs more than nothing')
  assertOnePurity(patch.purity_id ?? null, patch.custom_purity ?? null)
}
