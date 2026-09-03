import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { Carrier, CarrierService, NewCarrierService } from '@/features/carriers/types'

export const useCarriers = () => {
  return useApiQuery<Carrier[]>({
    key: queryKeys.carriers(),
    url: '/carriers/get',
    requireUser: false,
  })
}

// Callers build (and the drawer edits) a whole Carrier - the READ shape,
// carrying organization.id/created_at/updated_at. The write bodies never
// took organization.id (the service resolves the organization through the
// carrier's own organization_id, server-side) and CarrierCreate/CarrierPatch
// are strict, so both are trimmed to exactly what the contract declares.
export const useCreateCarrier = () => {
  return useApiMutation<Carrier, Carrier, Carrier[]>({
    queryKey: queryKeys.carriers(),
    url: '/carriers/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (carrier) => ({
      carrier: {
        logo: carrier.logo,
        organization: {
          name: carrier.organization.name,
          email: carrier.organization.email,
          phone: carrier.organization.phone,
          enabled: carrier.organization.enabled,
        },
      },
    }),
  })
}

export const useUpdateCarrier = () => {
  return useApiMutation<Carrier, Carrier, Carrier[]>({
    queryKey: queryKeys.carriers(),
    url: '/carriers/update',
    listAction: 'upsert',
    body: (carrier) => ({
      carrier: {
        id: carrier.id,
        logo: carrier.logo,
        organization: {
          name: carrier.organization.name,
          email: carrier.organization.email,
          phone: carrier.organization.phone,
          enabled: carrier.organization.enabled,
        },
      },
    }),
  })
}

export const useCarrierServices = () => {
  return useApiQuery<CarrierService[]>({
    key: queryKeys.carrierServices(),
    url: '/carrier_services/get',
    requireUser: true,
  })
}

export const useCarrierServicesByCarrier = (carrier_id: string) => {
  return useApiQuery<CarrierService[]>({
    key: queryKeys.carrierServicesByCarrier(carrier_id),
    url: '/carrier_services/get_by_carrier',
    requireUser: true,
    params: () => ({ carrier_id }),
    enabled: !!carrier_id,
  })
}

export const useCreateCarrierService = () => {
  return useApiMutation<CarrierService, NewCarrierService, CarrierService[]>({
    queryKey: queryKeys.carrierServices(),
    url: '/carrier_services/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (service) => ({ service }),
  })
}

// Callers send the whole read row (CarrierService); the write contract keeps
// every field name the wire has always used (the supports_pickup/
// supports_dropoff/max_weight_lbs aliases included) but drops the four audit
// columns `create()`/`update()` never wrote - strict, so carrying them 400s.
export const useUpdateCarrierService = () => {
  return useApiMutation<CarrierService, CarrierService, CarrierService[]>({
    queryKey: queryKeys.carrierServices(),
    url: '/carrier_services/update',
    requireAdmin: true,
    listAction: 'upsert',
    body: (service) => {
      const { created_by, updated_by, created_at, updated_at, ...patch } = service
      return { service: patch }
    },
  })
}

export const useDeleteCarrierService = () => {
  return useApiMutation<void, CarrierService, CarrierService[]>({
    queryKey: queryKeys.carrierServices(),
    method: 'DELETE',
    url: '/carrier_services/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (service) => ({ id: service.id }),
  })
}
