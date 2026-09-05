import type { CarrierHandoff, CarrierServiceOption } from '@dorado/contracts'

type CarrierServiceVocabulary = Omit<CarrierServiceOption, 'max_insured_value' | 'id'>

type CarrierCatalogue = {
  handoffs: CarrierHandoff[]
  services: CarrierServiceVocabulary[]
}

export const CATALOGUE: CarrierCatalogue = {
  handoffs: [
    {
      code: 'DROPOFF_AT_FEDEX_LOCATION',
      name: 'Store Dropoff',
      requires_schedule: false,
      has_dropoff_locations: true,
      display_order: 0,
    },
    {
      code: 'CONTACT_FEDEX_TO_SCHEDULE',
      name: 'Carrier Pickup',
      requires_schedule: true,
      has_dropoff_locations: false,
      display_order: 1,
    },
  ],
  services: [
    {
      code: 'FEDEX_EXPRESS_SAVER',
      name: 'Express Saver',
      carrier_code: 'FDXE',
      display_order: 0,
    },
    {
      code: 'PRIORITY_OVERNIGHT',
      name: 'Priority Overnight',
      carrier_code: 'FDXE',
      display_order: 1,
    },
  ],
}
