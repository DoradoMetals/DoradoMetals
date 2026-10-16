import { describe, expect, test } from 'vitest'
import type { FulfillmentMethodRead } from '@dorado/contracts'

import { calendarDay, fulfillmentChoices, methodFor } from '../_lib'

const method = (patch: Partial<FulfillmentMethodRead>): FulfillmentMethodRead => ({
  id: 'm-1',
  type: 'SHIP',
  label: 'Ship',
  admin_label: null,
  category: 'SHIPMENT',
  direction: 'purchase',
  enabled: true,
  hidden: false,
  is_default: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...patch,
})

describe('methodFor', () => {
  const methods = [
    method({ id: 'ship-a' }),
    method({ id: 'ship-default', is_default: true }),
    method({ id: 'pickup', category: 'PICKUP' }),
    method({ id: 'direct-off', category: 'DIRECT', enabled: false }),
  ]

  test('takes the default enabled method of the tab category', () => {
    expect(methodFor(methods, 'shipment')).toBe('ship-default')
    expect(methodFor(methods, 'pickup')).toBe('pickup')
  })

  test('a disabled or missing category gives no method', () => {
    expect(methodFor(methods, 'appointment')).toBeNull()
  })
})

describe('fulfillmentChoices', () => {
  const day = new Date(2026, 9, 20, 9, 30)

  test('shipment maps the draft to shipment choices and drops blanks', () => {
    expect(
      fulfillmentChoices('shipment', {
        carrier_service_id: 'svc',
        package_id: 'box',
        ship_from_id: 'addr-1',
        ship_to_id: '',
        date: day,
        additional_coverage: '1,500.00',
      })
    ).toEqual({
      shipment: {
        carrier_service_id: 'svc',
        package_id: 'box',
        shipper_address_id: 'addr-1',
        pickup_date: '2026-10-20',
        additional_coverage: 1500,
      },
    })
  })

  test('pickup and appointment map to their own choices', () => {
    expect(fulfillmentChoices('pickup', { address_id: 'a', driver_id: 'd' })).toEqual({
      pickup: { pickup_address_id: 'a', assigned_employee_id: 'd' },
    })
    expect(
      fulfillmentChoices('appointment', { location_id: 'o', employee_id: 'e', date: day })
    ).toEqual({
      direct: { location_id: 'o', assigned_employee_id: 'e', start_time: day.toISOString() },
    })
  })

  test('an empty draft sends no patch', () => {
    expect(fulfillmentChoices('shipment', {})).toBeNull()
    expect(fulfillmentChoices('appointment', {})).toBeNull()
  })

  test('calendarDay is the local day', () => {
    expect(calendarDay(day)).toBe('2026-10-20')
  })
})
