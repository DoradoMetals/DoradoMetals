// THE ORDER TYPES BOTH DIRECTIONS SHARE.
//
// Wave 3 collapsed PurchaseOrder and SalesOrder into ONE contract shape -
// orders.orders verbatim plus `totals`, with `direction` as the column that
// tells the two apart. What survived the collapse was two files declaring the
// same things twice: `purchaseOrderReturnShipmentSchema` and
// `salesOrderReturnShipmentSchema` were byte-identical, `StatusConfigEntry`
// and `StatusConfig` were declared identically in both (and a third time,
// privately, in ui/OrderStatusShared.tsx), and the four drawer prop interfaces
// differed only in the name of a type that is now one type.
//
// They live here once. The two direction files keep their LOCAL NAMES and
// re-export from here, because this tree's components are per-direction and
// `PurchaseOrderDrawerProps` reads at a call site inside purchaseOrders/ -
// CLAUDE.md's rule that the frontend keeps local names for UI concerns while
// the shape comes from one place.
import { z } from 'zod/v4'
import type { LucideIcon } from '@dorado/icons'
import { Address, OrderRead, OrderView, UserAddressRead } from '@dorado/contracts'
import { pickupSchema } from '@/shared/types/handoff'
import { packageSchema } from '@/shared/types/packaging'
import { serviceSchema } from '@/shared/types/service'
import { insuranceSchema } from '@/shared/types/insurance'
import { User } from '@/shared/types/users'

// THE ORDER IS THE ROW. There is no purchase order type and no sales order
// type; there is an order, and a `direction` column.
//
// Everything that used to hang off it is its own hook now:
//   lots             useOrderLots(order.id)           @dorado/client
//   address          useOrderAddress(order.id)        features/orders/reads
//   shipment /       useOrderShipments(order.id)      features/shipping
//   return_shipment    + outboundOf / returnOf
//   payout           useOrderPaymentDetails(order.id)        features/payouts
//   carrier_pickup   useShipmentPickups(shipment.id)  features/shipping
//   user             user_id, mapped off useAdminUsers
// The assay and the refinery are NOT in that list any more. They were the
// per-order refiner ENGAGEMENT (`refiners.orders` / `refiners.items`), and the
// lots lane deleted both: the assay is the lot's own weights, and a refining
// order is the business's own order to a counterparty, reached by its own id
// (`useRefiningOrder`) rather than by a customer order's - no key joins the
// two (ruling 42), and the badge that names one is
// `OrderLotView.refining_order_number`.
// and the money that was flattened onto the order - shipping_paid,
// waive_shipping_fee, waive_payout_fee, shipping_fee_actual, used_funds,
// shipping_service - is on `totals`, which is the orders.transactions row it
// always came from.
export type Order = OrderRead

// The return leg an admin books when cancelling. Identical for both
// directions, and it always was: one form, one shape.
export const orderReturnShipmentSchema = z.object({
  address: Address,
  user_address: UserAddressRead.optional(),
  package: packageSchema,
  pickup: pickupSchema,
  service: serviceSchema,
  insurance: insuranceSchema,
})
export type OrderReturnShipment = z.infer<typeof orderReturnShipmentSchema>

// STATUS IS A PURE LABEL (ruling 2) - customer-facing progress display only,
// driving no logic anywhere. This is the display config for one: the icon and
// what the money figure beside it is called.
export type StatusConfigEntry = {
  icon: LucideIcon
  value_label: string
}

export type StatusConfig = Record<string, StatusConfigEntry>

// THE DRAWER PROPS. A drawer holds the ORDER ID and one read; everything
// below it takes the `OrderView` that read answered (ruling 14, container /
// presentational). That is the change this pass makes: a drawer used to find
// its order inside a LIST cache and then call six order-scoped reads to put
// the rest back together, which is the fan-out the view exists to end.
//
// `view.order` is the row, `view.totals` its money, `view.items` its lines
// with their own arithmetic, and `view.actions` what may be done to it - the
// switch statements two of these components used to hold.
export interface OrderDrawerProps {
  user_id?: string
  order_id: string
  user?: User
}

export interface OrderViewProps {
  view: OrderView
}

export interface OrderDrawerHeaderProps extends OrderViewProps {
  username: string
  setIsOrderActive: (open: boolean) => void
}
