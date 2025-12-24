import { z } from 'zod'
import { TruckIcon, StorefrontIcon, IconProps } from '@phosphor-icons/react'
import { format } from 'date-fns'

export interface CarrierPickup {
  id: string
  user_id: string
  order_id: string
  carrier: string
  pickup_requested_at: string
  pickup_status: string
  confirmation_number: number
  location: string
}

export type PickupType = {
  label: string
  name: string
  icon: React.ComponentType<IconProps>
  date: string
  time: string
}

export const pickupSchema = z.object({
  label: z.string(),
  name: z.string(),
  icon: z.any(),
  selectedDate: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
})

export const pickupOptions: Record<string, PickupType> = {
  DROPOFF_AT_FEDEX_LOCATION: {
    label: 'DROPOFF_AT_FEDEX_LOCATION',
    name: 'Store Dropoff',
    icon: StorefrontIcon,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
  },
  CONTACT_FEDEX_TO_SCHEDULE: {
    label: 'CONTACT_FEDEX_TO_SCHEDULE',
    name: 'Carrier Pickup',
    icon: TruckIcon,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
  },
}
