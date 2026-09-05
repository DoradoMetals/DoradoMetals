import { LucideIcon, Package2, Inbox } from '@dorado/icons'
import { z } from 'zod/v4'

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
  // The shipping.packages ROW the checkout row stores (D208).
  id: z.string().uuid().optional(),
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

interface PackageOption {
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

// packageOptions - the hardcoded box record - died with D208/112: the boxes
// are shipping.packages rows served by GET /api/shipping/packages, and the
// minimum billable weights ride the rows.
