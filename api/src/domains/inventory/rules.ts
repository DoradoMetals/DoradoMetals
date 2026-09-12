import { Invalid, NotFound } from '#shared/errors.ts'
import type { Action, Lot, LotActions, LotPosition, LotSource, Position } from '@dorado/contracts'

const SPLITTABLE: Position[] = ['incoming', 'on hand']
const AT_REFINER: Position[] = ['at refiner', 'pooled']
const COMBINABLE: Position[] = ['on hand', ...AT_REFINER]

export function offer(
  name: string,
  confirm: string | null = null,
  override: string | null = null
): Action {
  return { name, confirm, override }
}

export function actionsFor(position: Position): LotActions {
  const offered: Action[] = []
  if (SPLITTABLE.includes(position)) offered.push(offer('split'))
  if (position === 'on hand') {
    offered.push(offer('combine'))
  } else if (COMBINABLE.includes(position)) {
    offered.push(
      offer(
        'combine',
        'This lot already sits at a refiner. Combining moves its refiner assignment to the new lot.'
      )
    )
  }
  return offered
}

export function assertOrderLot<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no order lot ${id}`)
}

export function assertLot<T>(row: T | null | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no lot ${id}`)
}

export function assertSplittable(position: Position | undefined, lot_id: string): void {
  if (position === undefined) throw new NotFound(`no lot ${lot_id}`)
  if (!SPLITTABLE.includes(position)) {
    throw new Invalid(`lot ${lot_id} is ${position}, so it cannot be split`)
  }
}

export function assertParentsMarked(marked: number, expected: number, id: string): void {
  if (marked !== expected) {
    throw new Error(
      `lot ${id}: ${expected} parent(s) to mark combined, ${marked} written - ` +
        `this transaction must not commit`
    )
  }
}

// Combining is BLOCKED unless every lot is `on hand`, or every lot is
// `at refiner`/`pooled` through the SAME refiner lot - a customer-side
// combine of lots the refiner already holds together. Returns that shared
// refiner lot's id so the caller can re-point its batch edges at the newly
// combined lot, or null when this is the ordinary on-hand combine.
export function assertCombinable(
  asked: string[],
  lots: Lot[],
  positions: LotPosition[],
  sources: LotSource[]
): string | null {
  if (lots.length !== asked.length) {
    const missing = asked.filter((id) => !lots.some((lot) => lot.id === id))
    throw new NotFound(`no lot ${missing.join(', ')}`)
  }

  const positionOf = (id: string): Position | undefined =>
    positions.find((row) => row.id === id)?.position

  const allOnHand = lots.every((lot) => positionOf(lot.id) === 'on hand')
  const allAtRefiner = lots.every((lot) => {
    const position = positionOf(lot.id)
    return position !== undefined && AT_REFINER.includes(position)
  })

  let refinerLot: string | null = null
  if (!allOnHand) {
    if (!allAtRefiner) {
      const notOnHand = lots.filter((lot) => positionOf(lot.id) !== 'on hand')
      throw new Invalid(
        `lot ${notOnHand.map((lot) => lot.id).join(', ')} is not on hand, so it cannot be combined`
      )
    }
    const batchParentOf = (id: string): string | undefined =>
      sources.find((edge) => edge.source_lot_id === id && edge.kind === 'batch')?.lot_id
    const refinerLots = new Set(lots.map((lot) => batchParentOf(lot.id)))
    if (refinerLots.size !== 1 || refinerLots.has(undefined)) {
      throw new Invalid('lots are at different refiners, so they cannot be combined')
    }
    refinerLot = [...refinerLots][0] ?? null
  }

  if (new Set(lots.map((lot) => lot.metal_id)).size > 1) {
    throw new Invalid('lots must share a metal to be combined')
  }
  if (new Set(lots.map((lot) => lot.unit)).size > 1) {
    throw new Invalid('lots must share a unit to be combined')
  }
  if (new Set(lots.map((lot) => lot.bullion_id ?? 'scrap')).size > 1) {
    throw new Invalid('a catalogue lot cannot be combined with a scrap lot')
  }

  return refinerLot
}
