import { Forbidden, Invalid, NotFound } from '#shared/errors.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { CheckoutWrite } from '@dorado/contracts'
import { fineContent } from '#shared/utils/convertWeights.ts'
import type {
  Checkout,
  CheckoutDecisions,
  CheckoutItem,
  CheckoutItemWrite,
  CheckoutMissing,
  CheckoutScrapLine,
  CheckoutViewFacts,
  Direction,
  FulfillmentStep,
} from '@dorado/contracts'

export function assertCatalogueLine(direction: Direction): void {
  if (direction === 'sale') {
    throw new Invalid('a buy basket holds catalogue products - every line needs a bullion_id')
  }
}

export function assertProductAvailable(
  written: CheckoutItem | undefined,
  bullion_id: string
): asserts written is CheckoutItem {
  if (!written) throw new Invalid(`product ${bullion_id} is not available`)
}

export function scrapLine(checkout_id: string, line: CheckoutScrapLine): CheckoutItemWrite {
  return {
    checkout_id,
    bullion_id: null,
    metal_id: line.metal_id,
    pre_melt: line.pre_melt,
    post_melt: line.post_melt ?? null,
    purity: line.purity,
    content: fineContent(line.pre_melt, line.unit, line.purity),
    unit: line.unit,
    premium: null,
    quantity: line.quantity ?? null,
  }
}

export function checkoutState(
  view: CheckoutViewFacts,
  handover: FulfillmentStep[]
): CheckoutDecisions {
  const missing: CheckoutMissing[] = []
  if (view.items.length === 0) missing.push('items')

  if (!view.fulfillment_id) missing.push('fulfillment_id')
  else missing.push(...handover)

  if (view.direction === 'purchase') {
    if (!view.payment_details_id) missing.push('payment_details_id')
  } else if (!view.recipient_address_id) {
    missing.push('recipient_address_id')
  }

  return { missing }
}

export const CHOICE_COLUMNS = columnsOf(CheckoutWrite)

type CheckoutWriteColumns = Partial<Pick<Checkout, (typeof CHOICE_COLUMNS)[number]>>

export function mergeChoices(
  anonymous: CheckoutWriteColumns,
  real: CheckoutWriteColumns
): CheckoutWriteColumns {
  const patch: Record<string, unknown> = {}
  for (const column of CHOICE_COLUMNS) {
    const chosen = anonymous[column] ?? real[column] ?? null
    if (chosen !== (real[column] ?? null)) patch[column] = chosen
  }
  return patch as CheckoutWriteColumns
}

export function assertSession<T>(row: T | null | undefined): asserts row is T {
  if (!row) throw new Error('the checkout session could not be created')
}

export function assertMaySubjectAnother(is_admin: boolean): void {
  if (!is_admin) throw new Forbidden('user_id is admin-only')
}

export function assertSubject(found: boolean, named_user_id: string): void {
  if (!found) throw new NotFound(`no user ${named_user_id}`)
}

export function assertRealAccount(anonymous: boolean, action: string): void {
  if (anonymous) throw new Forbidden(`sign in to ${action}`)
}

export function assertPayoutDirection(direction: Direction): void {
  if (direction !== 'purchase') {
    throw new Invalid('the payout step belongs to the purchase checkout')
  }
}

export function assertRekeyed(rekeyed: boolean, checkout_id: string, user_id: string): void {
  if (!rekeyed) {
    throw new Error(`checkout ${checkout_id} could not be re-keyed to ${user_id}`)
  }
}

export function assertLinesCarried(carried: number, expected: number, checkout_id: string): void {
  if (carried !== expected) {
    throw new Error(`checkout ${checkout_id}: ${expected} line(s) to carry, ${carried} moved`)
  }
}

export function assertVisitorRowGone(
  removed: boolean,
  visitor_id: string,
  survivor_id: string
): void {
  if (!removed) {
    throw new Error(`checkout ${visitor_id} survived the merge onto ${survivor_id}`)
  }
}
