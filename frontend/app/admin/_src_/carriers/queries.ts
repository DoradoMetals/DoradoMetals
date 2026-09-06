// The carrier admin surface - the hooks live in @dorado/client's shipping
// module (packages/client/src/shipping/queries.ts) now, typed on
// CarrierPatch/CarrierServicePatch. What is left here is what that package
// deliberately does not know: CarriersDrawer.tsx and CarrierServicesDrawer.tsx
// edit the whole READ row in place, so the trim down to the write contract
// (dropping organization.id/created_at/updated_at for a carrier,
// created_by/updated_by/created_at/updated_at for a service) lives here, the
// same shape adaptation `useReplaceCheckoutLots` does for a basket line.
import {
  useCarrierServicesFor,
  useCarriers as useCarriersBase,
  useCarrierServices as useCarrierServicesBase,
  useCreateCarrier as useCreateCarrierBase,
  useUpdateCarrier as useUpdateCarrierBase,
  useCreateCarrierService as useCreateCarrierServiceBase,
  useUpdateCarrierService as useUpdateCarrierServiceBase,
  useDeleteCarrierService as useDeleteCarrierServiceBase,
} from '@dorado/client'
import type { CarrierPatch, CarrierServicePatch } from '@dorado/contracts'
import type { Carrier, CarrierService } from './types'

export const useCarriers = () => useCarriersBase()
export const useCarrierServices = () => useCarrierServicesBase()
export const useCarrierServicesByCarrier = (carrier_id: string) => useCarrierServicesFor(carrier_id)

// name/enabled are NOT NULL columns; the read widens both to nullable
// because it composes through a join that can miss (OrganizationSummary).
// null only arrives here on a carrier the join failed for, which a write is
// never really about - coalesced to undefined so the patch leaves them alone
// rather than writing null into a column that refuses it.
const carrierPatch = (carrier: Carrier): CarrierPatch => ({
  logo: carrier.logo,
  organization: {
    name: carrier.organization.name ?? undefined,
    email: carrier.organization.email,
    phone: carrier.organization.phone,
    enabled: carrier.organization.enabled ?? undefined,
  },
})

export const useCreateCarrier = () => {
  const mutation = useCreateCarrierBase()
  return {
    ...mutation,
    mutate: (carrier: Carrier) => mutation.mutate({ carrier: carrierPatch(carrier) }),
    mutateAsync: (carrier: Carrier) => mutation.mutateAsync({ carrier: carrierPatch(carrier) }),
  }
}

export const useUpdateCarrier = () => {
  const mutation = useUpdateCarrierBase()
  const patch = (carrier: Carrier): CarrierPatch => ({ id: carrier.id, ...carrierPatch(carrier) })
  return {
    ...mutation,
    mutate: (carrier: Carrier) => mutation.mutate({ carrier: patch(carrier) }),
    mutateAsync: (carrier: Carrier) => mutation.mutateAsync({ carrier: patch(carrier) }),
  }
}

export const useCreateCarrierService = () => {
  const mutation = useCreateCarrierServiceBase()
  return {
    ...mutation,
    mutate: (service: { carrier_id: string; name: string }) => mutation.mutate({ service }),
    mutateAsync: (service: { carrier_id: string; name: string }) =>
      mutation.mutateAsync({ service }),
  }
}

// The three shared spellings stay - dropping them would silently render
// every toggle off.
const servicePatch = (service: CarrierService): CarrierServicePatch => {
  const { created_by, updated_by, created_at, updated_at, ...patch } = service
  return patch
}

export const useUpdateCarrierService = () => {
  const mutation = useUpdateCarrierServiceBase()
  return {
    ...mutation,
    mutate: (service: CarrierService) => mutation.mutate({ service: servicePatch(service) }),
    mutateAsync: (service: CarrierService) =>
      mutation.mutateAsync({ service: servicePatch(service) }),
  }
}

export const useDeleteCarrierService = () => {
  const mutation = useDeleteCarrierServiceBase()
  return {
    ...mutation,
    mutate: (service: CarrierService) => mutation.mutate({ id: service.id }),
    mutateAsync: (service: CarrierService) => mutation.mutateAsync({ id: service.id }),
  }
}
