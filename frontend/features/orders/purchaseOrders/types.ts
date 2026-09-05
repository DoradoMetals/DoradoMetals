import { z } from 'zod/v4'

import type { Address, UserAddressRead } from "@dorado/contracts";

import { Truck, PackageOpen, CreditCard, Ban, ShieldCheck } from '@dorado/icons'
import { pickupSchema } from '@/features/handoff/types'
import { payoutSchema } from '@/features/payouts/types'
import { serviceSchema } from '@/features/service/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'

// THE SHARED HALF LIVES IN ../types.ts. Wave 3 collapsed the two directions
// into one contract shape, and these were the leftovers of the old pair: the
// order type, the return-shipment schema, the status-config types and the four
// drawer prop interfaces were declared identically in this file and in
// salesOrders/types.ts. They are declared ONCE now and re-exported here under
// the names this tree's components already use (CLAUDE.md: the frontend keeps
// local names for UI concerns).
export type { Order as PurchaseOrder } from '@/features/orders/types'
export {
  orderReturnShipmentSchema as purchaseOrderReturnShipmentSchema,
} from '@/features/orders/types'
export type {
  OrderReturnShipment as PurchaseOrderReturnShipment,
  StatusConfigEntry,
  StatusConfig,
  OrderDrawerProps as PurchaseOrderDrawerProps,
  OrderDrawerHeaderProps as PurchaseOrderDrawerHeaderProps,
  OrderViewProps as PurchaseOrderDrawerContentProps,
  OrderViewProps as PurchaseOrderDrawerFooterProps,
  OrderViewProps as PurchaseOrderActionButtonsProps,
} from '@/features/orders/types'

import type { StatusConfig } from '@/features/orders/types'

// THE STEPPER'S OWN FORM STATE, and nothing else. Every field here is a
// choice the browser is still making; none of it is a table row. The basket
// is not a field of it - the lines live in the checkout items store and on
// checkout.items (ruling 50) - and the schema that used to parse this whole
// object died with them.
export type PurchaseCheckoutForm = {
  address: Address
  user_address?: UserAddressRead
  // RULING 58: the box's weight and dimensions are the server's - the shipping.packages
  // ROW id is the only thing the browser holds onto, plus its label for display.
  package: { id: string; label: string }
  fedexPackageToggle: boolean
  pickup: z.infer<typeof pickupSchema>
  service: z.infer<typeof serviceSchema>
  payoutValid: boolean
  payout: z.infer<typeof payoutSchema>
  confirmation: boolean
  insurance: z.infer<typeof insuranceSchema>
}

export const PurchaseOrderStatuses = [
  'In Transit',
  'Received',
  'Payment Processing',
  'Cancelled',
  'Completed',
]

export const statusConfig: StatusConfig = {
  'In Transit': {
    icon: Truck,
    value_label: 'Estimate',
  },
  Received: {
    icon: PackageOpen,
    value_label: 'Estimate',
  },
  'Payment Processing': {
    icon: CreditCard,
    value_label: 'Payout',
  },
  Cancelled: {
    icon: Ban,
    value_label: '',
  },
  Completed: {
    icon: ShieldCheck,
    value_label: 'Payout',
  },
}

// ProfitMetalsDict / ProfitCategoriesDict / PurchaseOrderTotals lived here
// until 2026-08-28: the shape of the LAST client money math. The profit
// breakdown is served by POST /quotes/profit_breakdown now and its shape is
// the contracts' ProfitBreakdown.