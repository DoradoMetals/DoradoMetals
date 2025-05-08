import { LucideIcon, Rocket, PackageCheck, Train } from 'lucide-react'
import { z } from 'zod'

export interface ShippingService {
  serviceType: string
  serviceDescription?: string
  netCharge?: number
  currency?: string
  deliveryDay?: string
  transitTime?: Date,
  icon?: LucideIcon
  code: string,
}

export const serviceSchema = z.object({
  serviceType: z.string(),
  serviceDescription: z.string().optional(),
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

export const serviceOptions: Record<string, ShippingService> = {
  // FEDEX_GROUND: {
  //   serviceType: 'FEDEX_GROUND',
  //   serviceDescription: 'FedEx Ground',
  //   netCharge: 0,
  //   currency: 'USD',
  //   deliveryDay: '',
  //   transitTime: new Date(),
  //   icon: Train,
  //   code: 'FDXG',
  // },
  FEDEX_EXPRESS_SAVER: {
    serviceType: 'FEDEX_EXPRESS_SAVER',
    serviceDescription: 'Express Saver',
    netCharge: 0,
    currency: 'USD',
    deliveryDay: '',
    transitTime: new Date(),
    icon: PackageCheck,
    code: 'FDXE',
  },
  PRIORITY_OVERNIGHT: {
    serviceType: 'PRIORITY_OVERNIGHT',
    serviceDescription: 'Priority Overnight',
    netCharge: 0,
    currency: 'USD',
    deliveryDay: '',
    transitTime: new Date(),
    icon: Rocket,
    code: 'FDXE',
  },
}