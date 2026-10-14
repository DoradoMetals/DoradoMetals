import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type {
  MetalSpot,
  SpotAdjustmentPatch,
  SpotAdjustmentRead,
  SpotLock,
  SpotSourcePatch,
  SpotSourceRead,
} from '@dorado/contracts'

export function assertSource(
  source: SpotSourceRead | undefined,
  id: string
): asserts source is SpotSourceRead {
  if (!source) throw new NotFound(`no spot source ${id}`)
}

export function assertSourceWritten(written: boolean, id: string): void {
  if (!written) throw new NotFound(`no spot source ${id}`)
}

export function assertSourceOrDefault(
  source_id: string | null,
  source: SpotSourceRead | undefined
): void {
  if (source_id !== null && !source) throw new NotFound(`no spot source ${source_id}`)
}

export function assertDefaultMoves(patch: SpotSourcePatch): void {
  if (patch.is_default === false) {
    throw new Invalid(
      'a source stops being the default only when another source is made the default'
    )
  }
}

export function assertMetal(
  metal: MetalSpot | undefined,
  metal_id: string
): asserts metal is MetalSpot {
  if (!metal) throw new NotFound(`no spot for ${metal_id}`)
}

export function assertAdjustment(
  row: SpotAdjustmentRead | undefined,
  metal_id: string,
  source_id: string
): asserts row is SpotAdjustmentRead {
  if (!row) throw new NotFound(`no adjustment for ${metal_id} on ${source_id}`)
}

export function assertAdjustmentReason(exists: boolean, patch: SpotAdjustmentPatch): void {
  if (!exists && !patch.reason) {
    throw new Invalid('a new adjustment needs a reason saying why the feed is being moved')
  }
}

export function assertFreezable(metal: MetalSpot, patch: SpotAdjustmentPatch): void {
  const named = patch.frozen_bid != null && patch.frozen_ask != null
  if (patch.mode === 'freeze' && !named && metal.last_bid === null) {
    throw new Invalid(
      `${metal.metal_id} has no price to hold: no source has quoted it, so name the pair to freeze at`
    )
  }
}

export function assertFreezeReason(reason: string): void {
  if (reason.trim() === '') throw new Invalid('freezing every metal needs a reason')
}

export function assertAdjustmentRemoved(
  removed: boolean,
  metal_id: string,
  source_id: string
): void {
  if (!removed) throw new NotFound(`no adjustment for ${metal_id} on ${source_id}`)
}

export function assertCancelled(count: number, metal_id: string): void {
  if (count === 0) throw new NotFound(`no adjustment in force on ${metal_id}`)
}

export function assertLock(lock: SpotLock | undefined, id: string): asserts lock is SpotLock {
  if (!lock) throw new NotFound(`no spot lock ${id}`)
}

export function assertLockActive(lock: SpotLock): void {
  if (lock.status !== 'active') {
    throw new Conflict(`the ${lock.metal_id} lock on ${lock.reference} is already released`)
  }
}
