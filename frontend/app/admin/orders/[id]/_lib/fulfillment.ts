import type {
  FulfillmentCategory,
  FulfillmentMethodRead,
  FulfillmentPatchBody,
} from '@dorado/contracts'

import { parseDecimal } from './units'

export type CreateTab = 'shipment' | 'pickup' | 'appointment' | 'return' | 'dropoff'

export type CreateDraft = {
  carrier_service_id?: string
  package_id?: string
  ship_to_id?: string
  ship_from_id?: string
  additional_coverage?: string
  bill_return_to_customer?: boolean
  driver_id?: string
  address_id?: string
  location_id?: string
  employee_id?: string
  refiner_id?: string
  date?: Date
  time?: string
}

export const CATEGORY_OF: Record<CreateTab, FulfillmentCategory> = {
  shipment: 'SHIPMENT',
  return: 'SHIPMENT',
  pickup: 'PICKUP',
  appointment: 'DIRECT',
  dropoff: 'DROPOFF',
}

export function methodFor(
  methods: readonly FulfillmentMethodRead[],
  tab: CreateTab
): string | null {
  const offered = methods.filter((method) => method.enabled && method.category === CATEGORY_OF[tab])
  return (offered.find((method) => method.is_default) ?? offered[0])?.id ?? null
}

const pad = (value: number) => String(value).padStart(2, '0')

export const calendarDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const present = <T extends Record<string, unknown>>(row: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ) as Partial<T>

export function fulfillmentChoices(
  tab: CreateTab,
  draft: CreateDraft
): FulfillmentPatchBody | null {
  const start_time = draft.date ? draft.date.toISOString() : undefined
  if (tab === 'shipment' || tab === 'return') {
    const shipment = present({
      carrier_service_id: draft.carrier_service_id,
      package_id: draft.package_id,
      shipper_address_id: draft.ship_from_id,
      recipient_address_id: draft.ship_to_id,
      pickup_date: draft.date ? calendarDay(draft.date) : undefined,
      pickup_time: draft.time,
      additional_coverage: parseDecimal(draft.additional_coverage ?? ''),
      ...(tab === 'return' && draft.bill_return_to_customer != null
        ? { bill_return_to_customer: draft.bill_return_to_customer }
        : {}),
    })
    return Object.keys(shipment).length > 0 ? { shipment } : null
  }
  if (tab === 'pickup') {
    const pickup = present({
      pickup_address_id: draft.address_id,
      assigned_employee_id: draft.driver_id,
      start_time,
    })
    return Object.keys(pickup).length > 0 ? { pickup } : null
  }
  if (tab === 'appointment') {
    const direct = present({
      location_id: draft.location_id,
      assigned_employee_id: draft.employee_id,
      start_time,
    })
    return Object.keys(direct).length > 0 ? { direct } : null
  }
  const dropoff = present({
    refiner_id: draft.refiner_id,
    driver_employee_id: draft.driver_id,
    start_time,
  })
  return Object.keys(dropoff).length > 0 ? { dropoff } : null
}
