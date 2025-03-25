import * as z from 'zod'
import { ReactNode } from 'react'
import { Scale, CircleDollarSign, Gem, Weight } from 'lucide-react'
import { GoldIcon, SilverIcon, PlatinumIcon, PalladiumIcon } from '@/components/icons/logo'

export const scrapSchema = z.object({
  id: z.string().uuid().optional(),
  metal_id: z.string().uuid(),
  gem_id: z.string().uuid().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  gross: z
  .string()
  .optional()
  .refine(
    (val) =>
      val === undefined ||
      val === '' ||
      /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val),
    { message: 'Must be a valid weight' }
  ),
  gross_unit: z.string().optional(),
  purity: z.number().optional(),
  content: z.number().optional(),
})

export type Scrap = z.infer<typeof scrapSchema>

export type PurityOption = {
  label: string
  value: number
}

export type MetalOption = {
  label: string
  logo: ReactNode
  blurb: string
  id: string
}

export type WeightOption = {
  label: string
  logo: ReactNode
  unit: string
  id: string
}

export const metalOptions: MetalOption[] = [
  {
    label: 'Gold',
    logo: <GoldIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry, nuggets, raw gold, casting grain, dental',
    id: '80f18a95-7ed4-4a87-93c7-74d9355da8fe',
  },
  {
    label: 'Silver',
    logo: <SilverIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry, flatware, tea sets, wire, sheets',
    id: '4e194eef-836f-4e9b-97f3-dda36a232dfb',
  },
  {
    label: 'Platinum',
    logo: <PlatinumIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry stamped PLAT, PT 950, PT 900',
    id: '03ce1689-b24f-4a15-b91c-3a1a6cbead7f',
  },
  {
    label: 'Palladium',
    logo: <PalladiumIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry stamped PALLADIUM, PD, PD 950, PD 900',
    id: '5ec4c718-2a8e-486c-9046-6c5b6e04a506',
  },
]

export const purityOptions: Record<string, PurityOption[]> = {
  gold: [
    { label: '10 Karat', value: 0.42 },
    { label: '12 Karat', value: 0.50 },
    { label: '14 Karat', value: 0.58 },
    { label: '18 Karat', value: 0.75 },
    { label: '22 Karat', value: 0.92 },
    { label: '24 Karat', value: 1.0 },
    { label: 'Custom', value: 0.0 },
  ],
  silver: [
    { label: '800', value: 0.8 },
    { label: 'Coin', value: 0.9 },
    { label: 'Sterling', value: 0.925 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.86 },
  ],
  platinum: [
    { label: '90%', value: 0.9 },
    { label: '95%', value: 0.95 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.95 },
  ],
  palladium: [
    { label: '90%', value: 0.9 },
    { label: '95%', value: 0.95 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.95 },
  ],
}

export const weightOptions: WeightOption[] = [
  {
    label: 'Grams',
    logo: <Scale size={20} className="text-secondary" />,
    unit: 'g',
    id: '1',
  },
  {
    label: 'Troy Oz.',
    logo: <CircleDollarSign size={20} className="text-secondary" />,
    unit: 't oz',
    id: '2',
  },
  {
    label: 'DWT',
    logo: <Gem size={20} className="text-secondary" />,
    unit: 'dwt',
    id: '3',
  },
  {
    label: 'Pounds',
    logo: <Weight size={20} className="text-secondary" />,
    unit: 'lb',
    id: '4',
  },
]
