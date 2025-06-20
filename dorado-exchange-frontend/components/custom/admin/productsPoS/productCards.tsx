import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { MetalOption } from '@/types/scrap'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { useGetInventory } from '@/lib/queries/admin/useAdminProducts'
import { getInventoryPriceTotals } from './inventoryPrices'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'
import { GoldIcon, PalladiumIcon, PlatinumIcon, SilverIcon } from '@/components/icons/logo'
import { ReactNode, useState } from 'react'

export default function ProductCards({
  selectedMetal,
  setSelectedMetal,
}: {
  selectedMetal: string
  setSelectedMetal: (metal: string | null) => void
}) {
  const { data: productsInventory } = useGetInventory()
  const { data: spotPrices = [] } = useSpotPrices()
  const [showDetails, setShowDetails] = useState(false)
  const metalOptions: {
    label: string
    getLogo: (isSelected: boolean) => ReactNode
    blurb: string
  }[] = [
    {
      label: 'Gold',
      getLogo: (isSelected) => (
        <GoldIcon size={30} stroke={isSelected ? 'white' : getCustomPrimaryIconStroke()} />
      ),
      blurb: 'Jewelry, nuggets, raw gold, casting grain',
    },
    {
      label: 'Silver',
      getLogo: (isSelected) => (
        <SilverIcon size={30} stroke={isSelected ? 'white' : getCustomPrimaryIconStroke()} />
      ),
      blurb: 'Jewelry, flatware, tea sets, wire, sheets',
    },
    {
      label: 'Platinum',
      getLogo: (isSelected) => (
        <PlatinumIcon size={30} stroke={isSelected ? 'white' : getCustomPrimaryIconStroke()} />
      ),
      blurb: 'Jewelry stamped PLAT, PT 950, PT 900',
    },
    {
      label: 'Palladium',
      getLogo: (isSelected) => (
        <PalladiumIcon size={30} stroke={isSelected ? 'white' : getCustomPrimaryIconStroke()} />
      ),
      blurb: 'Jewelry stamped PD, PD 950, PD 900',
    },
  ]

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 w-full">
        {productsInventory &&
          Object.entries(productsInventory).map(([metal, data]) => {
            const spot = spotPrices.find((s) => s.type === metal)
            const isSelected = selectedMetal === metal
            const icon = metalOptions.find((option) => metal === option.label)?.getLogo(isSelected)

            return (
              <Button
                key={metal}
                onClick={() => setSelectedMetal(metal === selectedMetal ? null : metal)}
                className={cn(
                  'bg-card p-4 rounded-lg w-full text-left transition h-full w-full hover:bg-card raised-off-page',
                  isSelected ? 'liquid-gold text-white' : 'bg-card'
                )}
              >
                <div className="flex flex-col w-full">
                  <div className="flex items-center w-full justify-between">
                    <div className={cn('flex items-center gap-2', isSelected && 'text-white')}>
                      {icon}
                      <div
                        className={cn(
                          'text-base text-primary-gradient',
                          isSelected && 'text-white'
                        )}
                      >
                        {metal}
                      </div>
                    </div>
                    <div className={cn('text-lg', isSelected && 'text-white')}>
                      <PriceNumberFlow
                        value={getInventoryPriceTotals({
                          product_list: data.inventory_list,
                          spot: spot!,
                        })}
                      />
                    </div>
                  </div>

                  {showDetails && (
                    <div className="flex flex-col mt-2 gap-1">
                      {[
                        ['Content:', data.total_content.toFixed(2)],
                        ['Coins:', data.coins],
                        ['Bars:', data.bars],
                        ['Other:', data.other],
                      ].map(([label, value], i) => (
                        <div key={i} className="flex items-center w-full justify-between">
                          <div
                            className={cn(
                              'text-sm',
                              isSelected ? 'text-white' : 'text-neutral-600'
                            )}
                          >
                            {label}
                          </div>
                          <div
                            className={cn(
                              'text-sm',
                              isSelected ? 'text-white' : 'text-neutral-800'
                            )}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Button>
            )
          })}
      </div>
      <div className="flex w-full ml-auto">
        <Button
          variant="ghost"
          className="text-sm text-primary-gradient p-0 ml-auto"
          onClick={() => setShowDetails((prev) => !prev)}
        >
          {showDetails ? 'Hide Inventory Totals' : 'Show Inventory Totals'}
        </Button>
      </div>
    </div>
  )
}

// <div className='flex items-center w-full justify-between'>
// </div>
