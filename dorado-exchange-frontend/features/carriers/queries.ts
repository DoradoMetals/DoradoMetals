import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { Carrier, CarrierService, NewCarrierService } from '@/features/carriers/types'

export const useCarrier = (carrier_id: string) => {
  return useApiQuery<Carrier[]>({
    key: queryKeys.carrier(carrier_id),
    url: '/carriers/get_one',
    requireAdmin: true,
    params: () => ({ carrier_id }),
    enabled: !!carrier_id,
  })
}

export const useCarriers = () => {
  return useApiQuery<Carrier[]>({
    key: queryKeys.carriers(),
    url: '/carriers/get',
    requireUser: false,
  })
}

export const useCreateCarrier = () => {
  return useApiMutation<Carrier, Carrier, Carrier[]>({
    queryKey: queryKeys.carriers(),
    url: '/carriers/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (carrier) => ({ carrier }),
  })
}

export const useUpdateCarrier = () => {
  return useApiMutation<Carrier, Carrier, Carrier[]>({
    queryKey: queryKeys.carriers(),
    url: '/carriers/update',
    listAction: 'upsert',
    body: (carrier) => ({ carrier }),
  })
}

export const useDeleteCarrier = () => {
  return useApiMutation<void, Carrier, Carrier[]>({
    queryKey: queryKeys.carriers(),
    method: 'DELETE',
    url: '/carriers/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (carrier) => ({ carrier_id: carrier.id }),
  })
}

export const useCarrierService = (service_id: string) => {
  return useApiQuery<CarrierService>({
    key: queryKeys.carrierService(service_id),
    url: '/carrier_services/get_one',
    requireAdmin: true,
    params: () => ({ id: service_id }),
    enabled: !!service_id,
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

export const useUpdateCarrierService = () => {
  return useApiMutation<CarrierService, CarrierService, CarrierService[]>({
    queryKey: queryKeys.carrierServices(),
    url: '/carrier_services/update',
    requireAdmin: true,
    listAction: 'upsert',
    body: (service) => ({ service }),
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
