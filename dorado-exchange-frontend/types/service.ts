import { LucideIcon, Clock, Rocket, Truck, PackageCheck } from 'lucide-react'
import { z } from 'zod'

export interface ShippingService {
  serviceType: string
  serviceDescription?: string
  netCharge: number
  currency: string
  deliveryDay?: string
  transitTime?: Date
  icon?: LucideIcon
}

export const serviceSchema = z.object({
  serviceType: z.string(),
  serviceDescription: z.string().optional(),
  netCharge: z.coerce.number().nonnegative({ message: 'Price is required' }),
  currency: z.string().min(1),
  deliveryDay: z.string().optional(),
  transitTime: z.date().optional(),
  icon: z.any().optional(),
})

export const serviceOptions: Record<string, Omit<ShippingService, 'netCharge' | 'currency'>> = {
  FEDEX_GROUND: {
    serviceType: 'FEDEX_GROUND',
    serviceDescription: 'FedEx Ground',
    icon: Truck,
  },
  FEDEX_2_DAY: {
    serviceType: 'FEDEX_2_DAY',
    serviceDescription: 'FedEx 2 Day',
    icon: Clock,
  },
  FEDEX_EXPRESS_SAVER: {
    serviceType: 'FEDEX_EXPRESS_SAVER',
    serviceDescription: 'Express Saver',
    icon: PackageCheck,
  },
  PRIORITY_OVERNIGHT: {
    serviceType: 'PRIORITY_OVERNIGHT',
    serviceDescription: 'Priority Overnight',
    icon: Rocket,
  },
}
