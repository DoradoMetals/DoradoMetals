import { LucideIcon, Package2, Inbox } from 'lucide-react'
import { Package } from '@phosphor-icons/react'
import { z } from 'zod'

export interface Package {
  label: string
  weight: {
    units: 'LB'
    value: number
  }
  dimensions: {
    length: number
    width: number
    height: number
    units: 'IN'
  }
  icon?: LucideIcon
}

export const packageSchema = z.object({
  label: z.string(),
  weight: z.object({
    units: z.literal('LB'),
    value: z.coerce
      .number()
      .positive()
      .refine(
        (val) => val === undefined || val === 0 || /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()),
        { message: 'Must be a valid weight' }
      ),
  }),
  dimensions: z.object({
    length: z.coerce
      .number()
      .positive()
      .refine(
        (val) => val === undefined || val === 0 || /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()),
        { message: 'Must be a valid length' }
      ),
    width: z.coerce
      .number()
      .positive()
      .refine(
        (val) => val === undefined || val === 0 || /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()),
        { message: 'Must be a valid width' }
      ),
    height: z.coerce
      .number()
      .positive()
      .refine(
        (val) => val === undefined || val === 0 || /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()),
        { message: 'Must be a valid height' }
      ),
    units: z.literal('IN'),
  }),
  icon: z.any().optional(),
  fedexPackage: z.boolean(),
})

export interface PackageOption {
  label: string
  weight: {
    units: 'LB'
    value: number
  }
  dimensions: {
    length: number
    width: number
    height: number
    units: 'IN'
  }
  icon?: LucideIcon
  fedexPackage: boolean
}

export const packageOptions: PackageOption[] = [
    {
    label: 'Small Box',
    weight: { units: 'LB', value: 2 },
    dimensions: { length: 9, width: 6, height: 2, units: 'IN' },
    icon: Inbox,
    fedexPackage: false,
  },
  {
    label: 'Medium Box',
    weight: { units: 'LB', value: 8 },
    dimensions: { length: 14, width: 10, height: 4, units: 'IN' },
    icon: Package2,
    fedexPackage: false,
  },
  {
    label: 'Large Box',
    weight: { units: 'LB', value: 20 },
    dimensions: { length: 18, width: 14, height: 6, units: 'IN' },
    icon: Package,
    fedexPackage: false,
  },
  {
    label: 'FedEx Small',
    weight: { units: 'LB', value: 2 },
    dimensions: { length: 12.2, width: 10.8, height: 1.50, units: 'IN' },
    icon: Inbox,
    fedexPackage: true,
  },
  {
    label: 'FedEx Medium',
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 12.9, width: 11.5, height: 2.3, units: 'IN' },
    icon: Package2,
    fedexPackage: true,
  },
  {
    label: 'FedEx Large',
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 17.8, width: 12.3, height: 3, units: 'IN' },
    icon: Package,
    fedexPackage: true,
  },
]

type Dimensions = { height?: number; width?: number; length?: number }

export function calculateVolume({ height, width, length }: Dimensions): number | null {
  if (height && width && length) {
    return height * width * length
  }
  return null
}
