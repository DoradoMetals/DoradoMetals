import { useAdminScrap } from '@/lib/queries/admin/useAdminScrap'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { convertTroyOz } from '@/utils/convertTroyOz'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import getScrapPrice from '@/utils/getScrapPrice'
import { metalOptions } from '@/types/scrap'
export default function ScrapInventoryHeaders() {
  const { data: scrap = [] } = useAdminScrap()
  const { data: spots } = useSpotPrices()

  const metals = ['gold', 'silver', 'platinum', 'palladium'] as const

  const totals = metals.reduce((acc, metal) => {
    const items = scrap.filter((item) => item.metal.toLowerCase() === metal)

    const grossSum = items.reduce((sum, item) => {
      const grossTroyOz = Number(convertTroyOz(item.gross, item.gross_unit))
      return sum + grossTroyOz
    }, 0)

    const puritySum = items.reduce((sum, item) => {
      const grossTroyOz = convertTroyOz(item.gross, item.gross_unit)
      return sum + grossTroyOz * item.purity
    }, 0)

    const averagePurity = grossSum > 0 ? puritySum / grossSum : 0

    acc[metal] = {
      gross: grossSum,
      purity: averagePurity,
    }

    return acc
  }, {} as Record<(typeof metals)[number], { gross: number; purity: number }>)

  return (
    <div className="flex gap-4 justify-between">
      {metals.map((metal) => (
        <div
          key={metal}
          className="w-full rounded-lg p-4 flex items-center justify-between bg-card"
        >
          <div className="flex flex-col gap-10 w-full">
            {/* This row: logo/metal name on the left, price on the right */}
            <div className="flex w-full justify-between items-start gap-20">
              <div className="flex items-start gap-2">
                {metalOptions.find((option) => option.label.toLowerCase() === metal)?.logo}
                <span className="text-base text-neutral-500 capitalize">{metal}</span>
              </div>

              <div className="text-xl text-neutral-800">
                <PriceNumberFlow
                  value={getScrapPrice(
                    totals[metal].gross * totals[metal].purity,
                    spots?.find((s) => s.type.toLowerCase() === metal)
                  )}
                />
              </div>
            </div>

            {/* Purity + weight */}
            <div className="flex w-full justify-between text-base text-neutral-700">
              <div className='flex gap-1 items-start'>
                {totals[metal].gross.toFixed(2)}{' '}
                <span className="text-sm text-neutral-500">t oz</span>
              </div>
              <div className='flex gap-1 items-start'>
                {(totals[metal].purity * 100).toFixed(2)}% 
                <span className="text-sm text-neutral-500">pure</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
