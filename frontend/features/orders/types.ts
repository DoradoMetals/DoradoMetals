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
import type { LucideIcon } from 'lucide-react'

import { orders, places } from "@dorado/contracts";
import { pickupSchema } from '@/features/handoff/types'
import { packageSchema } from '@/features/packaging/types'
import { serviceSchema } from '@/features/service/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'

// THE ORDER IS THE ROW. There is no purchase order type and no sales order
// type; there is an order, and a `direction` column.
//
// Everything that used to hang off it is its own hook now:
//   order_items      useOrderItems(order.id)          features/orders/reads
//   address          useOrderAddress(order.id)        features/orders/reads
//   shipment /       useOrderShipments(order.id)      features/shipping
//   return_shipment    + outboundOf / returnOf
//   payout           useOrderPayouts(order.id)        features/payouts
//   carrier_pickup   useShipmentPickups(shipment.id)  features/shipping
//   user             user_id, mapped off useAdminUsers
//   the assay        useRefinerItems(order.id)        features/refiners
//   the refinery     useRefinerOrder(order.id)        the ENGAGEMENT's refiner_id
// and the money that was flattened onto the order - shipping_paid,
// waive_shipping_fee, waive_payout_fee, shipping_fee_actual, used_funds,
// shipping_service - is on `totals`, which is the orders.transactions row it
// always came from.
export type Order = orders.orders.Read

// The return leg an admin books when cancelling. Identical for both
// directions, and it always was: one form, one shape.
export const orderReturnShipmentSchema = z.object({
  address: places.addresses.Row,
  user_address: places.user_addresses.Read.optional(),
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

// The drawer props. `order_id` not `order`: a drawer is a CONTAINER (ruling
// 14) - it holds the id and the hooks, and hands rows to presentational
// children.
export interface OrderDrawerProps {
  user_id?: string
  order_id: string
  user?: User
}

export interface OrderDrawerHeaderProps {
  order: Order
  username: string
  setIsOrderActive: (open: boolean) => void
}

export interface OrderDrawerContentProps {
  order: Order
}

export interface OrderDrawerFooterProps {
  order: Order
}

export interface OrderActionButtonsProps {
  order: Order
}
