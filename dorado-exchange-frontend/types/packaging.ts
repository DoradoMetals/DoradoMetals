import { LucideIcon, Package2, Package, Inbox } from 'lucide-react'
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
}

export const packageOptions: PackageOption[] = [
  {
    label: 'Small Box',
    weight: { units: 'LB', value: 2 },
    dimensions: { length: 10.5, width: 8, height: 1.5, units: 'IN' },
    icon: Inbox,
  },
  {
    label: 'Medium Box',
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 12, width: 10, height: 4, units: 'IN' },
    icon: Package2,
  },
  {
    label: 'Large Box',
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 18, width: 14, height: 6, units: 'IN' },
    icon: Package,
  },
]
type Dimensions = { height?: number; width?: number; length?: number }

export function calculateVolume({ height, width, length }: Dimensions): number | null {
  if (height && width && length) {
    return height * width * length
  }
  return null
}