import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import * as relabel from '#logistics/shipping/relabel.ts'
import type { Address, OrderView, UserAddress } from '@dorado/contracts'

export function assertAddress(address_id: string, row: Address | undefined): Address {
  if (!row) throw new NotFound(`no address ${address_id}`)
  return row
}

export function assertOwnedByCustomer(address_id: string, link: UserAddress | undefined): void {
  if (!link) {
    throw new Invalid(`address ${address_id} is not in this customer's address book`)
  }
}

export function assertRelabellable(view: OrderView): void {
  if (view.order.cancelled_at !== null) {
    throw new Conflict(`order ${view.order.number} is cancelled, so its address cannot change`)
  }
  if (relabel.inMotion(view.shipments)) {
    throw new Conflict(
      `order ${view.order.number} has a parcel in motion, so its label cannot be voided and bought again`
    )
  }
}

export function assertTaxStateHolds(view: OrderView, next: Address): void {
  if (view.order.direction !== 'sale') return
  if (view.address?.state === next.state) return
  throw new Invalid(
    `the sales tax charged for ${view.address?.state ?? 'the old state'} would move to ${next.state}; ` +
      'cancel this sale and place it again for the new address'
  )
}

export function customerOf(view: OrderView): string {
  if (!view.order.user_id) throw new Invalid(`order ${view.order.number} has no customer`)
  return view.order.user_id
}

export function assertOrder(order_id: string, view: OrderView | null): OrderView {
  if (!view) throw new NotFound(`no order ${order_id}`)
  return view
}
