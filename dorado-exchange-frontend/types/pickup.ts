import { z } from 'zod'
import { Truck, Store, LucideIcon } from 'lucide-react'
import { format } from 'date-fns'

export type PickupType = {
  label: string,
  name: string
  icon: LucideIcon
  date: string,
  time: string,
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
    icon: Store,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: ''
  },
  CONTACT_FEDEX_TO_SCHEDULE: {
    label: 'CONTACT_FEDEX_TO_SCHEDULE',
    name: 'Carrier Pickup',
    icon: Truck,
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
  },
}