import * as z from 'zod'
import { ReactNode } from 'react'
import { Scales, SketchLogo, Barbell, IconProps, Coins } from '@phosphor-icons/react'
import { GoldIcon, SilverIcon, PlatinumIcon, PalladiumIcon } from '@/components/icons/logo'
import { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'

export const scrapSchema = z.object({
  id: z.string().uuid(),
  metal: z.string(),
  gem_id: z.string().uuid().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  pre_melt: z.coerce
    .number()
    .positive()
    .refine(
      (val) => val === undefined || val === 0 || /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()),
      { message: 'Must be a valid weight' }
    ),
  gross_unit: z.string(),
  purity: z.number(),
  content: z.number().optional(),
  price: z.number().optional(),
})

export type ScrapInput = z.input<typeof scrapSchema>

export type Scrap = z.infer<typeof scrapSchema>

export type PurityOption = {
  label: string
  value: number
}

export type MetalOption = {
  label: string
  logo: ReactNode
  blurb: string
}

export type WeightOption = {
  label: string
  icon: React.ComponentType<IconProps>
  unit: string
  id: string
}

export const metalOptions: MetalOption[] = [
  {
    label: 'Gold',
    logo: <GoldIcon size={36} stroke={getCustomPrimaryIconStroke()} />,
    blurb: 'Jewelry, nuggets, raw gold, casting grain',
  },
  {
    label: 'Silver',
    logo: <SilverIcon size={36} stroke={getCustomPrimaryIconStroke()} />,
    blurb: 'Jewelry, flatware, tea sets, wire, sheets',
  },
  {
    label: 'Platinum',
    logo: <PlatinumIcon size={36} stroke={getCustomPrimaryIconStroke()} />,
    blurb: 'Jewelry stamped PLAT, PT 950, PT 900',
  },
  {
    label: 'Palladium',
    logo: <PalladiumIcon size={36} stroke={getCustomPrimaryIconStroke()} />,
    blurb: 'Jewelry stamped PD, PD 950, PD 900',
  },
]

export const purityOptions: Record<string, PurityOption[]> = {
  Gold: [
    { label: '10 Karat', value: 0.4 },
    { label: '12 Karat', value: 0.48 },
    { label: '14 Karat', value: 0.56 },
    { label: '18 Karat', value: 0.73 },
    { label: '22 Karat', value: 0.9 },
    { label: '24 Karat', value: 1.0 },
    { label: 'Custom', value: 0.5 },
  ],
  Silver: [
    { label: '800', value: 0.8 },
    { label: 'Coin', value: 0.9 },
    { label: 'Sterling', value: 0.925 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.5 },
  ],
  Platinum: [
    { label: '900', value: 0.9 },
    { label: '950', value: 0.95 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.5 },
  ],
  Palladium: [
    { label: '900', value: 0.9 },
    { label: '950', value: 0.95 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.5 },
  ],
}

export function getPurityLabel(purity: number, metal: string) {
  if (purity == null || !metal) return null

  const options = purityOptions[metal]
  const percent = `${(purity * 100).toFixed(1)}%`

  const match = options.find((opt) => Math.abs(opt.value - purity) < 0.001)

  return match ? (
    <div className="flex items-center gap-1">
      <span className="text-sm text-neutral-800">{match.label}</span>{' '}
      <span className="text-xs text-neutral-700">({percent})</span>
    </div>
  ) : (
    <div className="flex items-center gap-1">
      <span className="text-sm text-neutral-800">{percent}</span>{' '}
      <span className="text-xs text-neutral-700">pure</span>
    </div>
  )
}

export function getGrossLabel(gross: number, unit: string) {
  if (!gross || !unit) return null

  return (
    <>
      <div className="flex items-center gap-1">
        <span className="text-sm text-neutral-800">{gross}</span>{' '}
        <span className="text-xs text-neutral-700">{unit}</span>
      </div>
    </>
  )
}

export const weightOptions: WeightOption[] = [
  {
    label: 'Grams',
    icon: Scales,
    unit: 'g',
    id: '1',
  },
  {
    label: 'Troy Oz.',
    icon: Coins,
    unit: 't oz',
    id: '2',
  },
  {
    label: 'DWT',
    icon: SketchLogo,
    unit: 'dwt',
    id: '3',
  },
  {
    label: 'Pounds',
    icon: Barbell,
    unit: 'lb',
    id: '4',
  },
]

export function assignScrapItemNames(scrapItems: Scrap[]): Scrap[] {
  const metalOrder = ['Gold', 'Silver', 'Platinum', 'Palladium']

  const validScrapItems = scrapItems.filter((item) => item.metal)

  validScrapItems.sort((a, b) => {
    const indexA = metalOrder.indexOf(a.metal!)
    const indexB = metalOrder.indexOf(b.metal!)
    return indexA - indexB
  })

  const grouped: Record<string, Scrap[]> = {}

  validScrapItems.forEach((item) => {
    const metal = item.metal!
    if (!grouped[metal]) grouped[metal] = []
    grouped[metal].push(item)
  })

  return validScrapItems.map((item) => {
    const metal = item.metal!
    const group = grouped[metal]
    const index = group.indexOf(item)

    return {
      ...item,
      name: `${metal} Item ${index + 1}`,
    }
  })
}
