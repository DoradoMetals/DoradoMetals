import * as z from 'zod'
import { ReactNode } from 'react'
import { Scale, CircleDollarSign, Gem, Weight } from 'lucide-react'
import { GoldIcon, SilverIcon, PlatinumIcon, PalladiumIcon } from '@/components/icons/logo'

export const scrapSchema = z.object({
  id: z.string().uuid().optional(),
  metal: z.string().optional(),
  gem_id: z.string().uuid().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  gross: z
  .coerce.number()
  .optional()
  .refine(
    (val) =>
      val === undefined ||
      val === 0 ||
      /^(?!-)(\d+\.?\d*|\.\d+)?$/.test(val.toString()),
    { message: 'Must be a valid weight' }
  ),
  gross_unit: z.string().optional(),
  purity: z.number().optional(),
  content: z.number().optional(),
  price: z.number().optional(),
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
    blurb: 'Jewelry, nuggets, raw gold, casting grain',
  },
  {
    label: 'Silver',
    logo: <SilverIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry, flatware, tea sets, wire, sheets',
  },
  {
    label: 'Platinum',
    logo: <PlatinumIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry stamped PLAT, PT 950, PT 900',
  },
  {
    label: 'Palladium',
    logo: <PalladiumIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry stamped PD, PD 950, PD 900',
  },
]

export const purityOptions: Record<string, PurityOption[]> = {
  Gold: [
    { label: '10 Karat', value: 0.420 },
    { label: '12 Karat', value: 0.500 },
    { label: '14 Karat', value: 0.580 },
    { label: '18 Karat', value: 0.750 },
    { label: '22 Karat', value: 0.920 },
    { label: '24 Karat', value: 1.000 },
    { label: 'Custom', value: 0.000 },
  ],
  Silver: [
    { label: '800', value: 0.800 },
    { label: 'Coin', value: 0.900 },
    { label: 'Sterling', value: 0.925 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.000 },
  ],
  Platinum: [
    { label: '900', value: 0.900 },
    { label: '950', value: 0.950 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.000 },
  ],
  Palladium: [
    { label: '900', value: 0.900 },
    { label: '950', value: 0.950 },
    { label: 'Fine', value: 0.999 },
    { label: 'Custom', value: 0.000 },
  ],
}


export function getPurityLabel(scrap: Scrap) {
  const purity = scrap.purity
  const metal = scrap.metal
  if (purity == null || !metal) return null

  const options = purityOptions[metal]
  const percent = `${(purity * 100).toFixed(1)}%`

  if (!options) {
    return (
      <div className='flex items-center gap-1'>
        <span className="text-sm text-neutral-800">{percent}</span>{' '}
        <span className="tertiary-text">pure</span>
      </div>
    )
  }

  const match = options.find((opt) => Math.abs(opt.value - purity) < 0.001)

  return match ? (
    <div className='flex items-center gap-1'>
      <span className="text-sm text-neutral-800">{match.label}</span>{' '}
      <span className="tertiary-text">({percent} pure)</span>
    </div>
  ) : (
    <div className='flex items-center gap-1'>
      <span className="text-sm text-neutral-800">{percent}</span>{' '}
      <span className="tertiary-text">pure</span>
    </div>
  )
}

export function getGrossLabel(scrap: Scrap) {
  const gross = scrap.gross
  const unit = scrap.gross_unit

  if (!gross || !unit) return null

  const match = weightOptions.find((opt) => opt.unit === unit)
  const label = match?.label ?? unit

  return (
    <>
      <div className='flex items-center gap-1'>
        <span className='text-sm text-neutral-800'>{gross}</span> <span className="tertiary-text">{label}</span>
      </div>
    </>
  )
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

export function assignScrapItemNames(scrapItems: Scrap[]): Scrap[] {
  const grouped: Record<string, Scrap[]> = {}

  scrapItems.forEach((item) => {
    const metal = item.metal
    if (!metal) return

    if (!grouped[metal]) {
      grouped[metal] = []
    }
    grouped[metal].push(item)
  })

  return scrapItems.map((item) => {
    const metal = item.metal
    if (!metal) return item

    const group = grouped[metal] || []
    const index = group.indexOf(item)

    return {
      ...item,
      name: `${metal} Item ${index + 1}`,
    }
  })
}