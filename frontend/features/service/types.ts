import { LucideIcon, Rocket, PackageCheck } from 'lucide-react'
import { z } from 'zod/v4'

// A SHIPPING SERVICE AS THE CHECKOUT FORM CARRIES IT.
//
// WHAT USED TO BE HERE, AND WHY IT IS GONE. This file held `serviceOptions`, a
// record keyed by FEDEX_EXPRESS_SAVER and PRIORITY_OVERNIGHT, each carrying
// FedEx's FDXE carrier code - so the browser decided which of a carrier's
// services we offer, in what order, and what code to send on a pickup
// availability check. The frontend should not know what a FedEx service is
// called: it renders what the API gives it and sends back an id (ruling 12).
//
// The catalogue comes from GET /api/carrier_services/offered now
// (useCarrierServiceOptions, features/shipping/queries), and the selector joins
// it to the live rates by `code`.
//
// `serviceType` and `code` remain STRINGS THAT ROUND-TRIP: they are what the
// order create body carries into the label request, and the create still takes
// the whole composed checkout. The frontend does not interpret either any more,
// which is the part that mattered - it received them from the server and hands
// them back. When the create moves to ids-in-data-out, they stop travelling
// through the browser at all.
// `ShippingService` - the interface that described a `serviceOptions` entry -
// went with the record. Nothing else referenced it; `serviceSchema` below is
// what the checkout form actually validates against, and a
// `CarrierServiceOption` from @dorado/contracts is what the API sends.
// Ruling 32: the dead ones go.

// PARSED ON THE MONEY PATH - purchaseOrderCheckoutSchema.parse in reviewStep,
// and salesOrderCheckoutSchema before a Stripe confirm. Its shape, its field
// names and its validation do not move.
export const serviceSchema = z.object({
  serviceType: z.string(),
  serviceDescription: z.string(),
  netCharge: z.coerce.number().nonnegative({ message: 'Price is required' }),
  currency: z.string().min(1),
  deliveryDay: z.string().optional(),
  transitTime: z.preprocess(
    (val) => (typeof val === 'string' ? new Date(val) : val),
    z.date()
  ),
  icon: z.any().optional(),
  code: z.string(),
})

// The icon is a client concern and stays here (Jacob: "icons stay a client-side
// map beside the selector"). Keyed by DISPLAY ORDER rather than by a carrier's
// service type, for the same reason handoffIcon is keyed by behaviour: a map
// with FEDEX_EXPRESS_SAVER on the left-hand side would put the enum back in the
// browser for the sake of a picture. Faster service, faster-looking icon.
const serviceIcons: LucideIcon[] = [PackageCheck, Rocket]

export const serviceIcon = (display_order: number): LucideIcon =>
  serviceIcons[display_order] ?? PackageCheck
