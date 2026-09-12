import { Invalid, NotFound } from '#shared/errors.ts'
import type { Action, Lot, LotActions, LotPosition, Position } from '@dorado/contracts'

const SPLITTABLE: Position[] = ['incoming', 'on hand']

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
  if (position === 'on hand') offered.push(offer('combine'))
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

export function assertCombinable(asked: string[], lots: Lot[], positions: LotPosition[]): void {
  if (lots.length !== asked.length) {
    const missing = asked.filter((id) => !lots.some((lot) => lot.id === id))
    throw new NotFound(`no lot ${missing.join(', ')}`)
  }
  const notOnHand = lots.filter(
    (lot) => positions.find((row) => row.id === lot.id)?.position !== 'on hand'
  )
  if (notOnHand.length > 0) {
    throw new Invalid(
      `lot ${notOnHand.map((lot) => lot.id).join(', ')} is not on hand, so it cannot be combined`
    )
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
}
