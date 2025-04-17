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
  insured: boolean
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
  insured: z.boolean(),
})

export const packageOptions: Record<string, Package> = {
  'FedEx Small': {
    label: 'FedEx Small',
    weight: { units: 'LB', value: 2 },
    dimensions: { length: 10.88, width: 8.38, height: 1.63, units: 'IN' },
    icon: Inbox,
    insured: true,
  },
  'FedEx Medium': {
    label: 'FedEx Medium',
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 13.25, width: 11.5, height: 2.38, units: 'IN' },
    icon: Package2,
    insured: true,
  },
  'FedEx Large': {
    label: 'FedEx Large',
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 17.88, width: 12.38, height: 3, units: 'IN' },
    icon: Package,
    insured: true,
  },
  'Small': {
    label: 'Small',
    weight: { units: 'LB', value: 2 },
    dimensions: { length: 10.5, width: 8, height: 1.5, units: 'IN' },
    icon: Inbox,
    insured: false,
  },
  'Medium': {
    label: 'Medium',
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 12, width: 10, height: 4, units: 'IN' },
    icon: Package2,
    insured: false,
  },
  'Large': {
    label: 'Large',
    weight: { units: 'LB', value: 10 },
    dimensions: { length: 18, width: 14, height: 6, units: 'IN' },
    icon: Package,
    insured: false,
  },
}