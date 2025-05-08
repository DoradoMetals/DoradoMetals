import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { metalOptions, WeightOption, weightOptions } from '@/types/scrap'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { useState } from 'react'
import WeightSelect from './weightSelect'
import { SpotPrice } from '@/types/metal'
import { convertTroyOz } from '@/utils/convertTroyOz'
import { Button } from '@/components/ui/button'
import { Check, Edit2 } from 'lucide-react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { Input } from '@/components/ui/input'
import { useEditScrapPercentages } from '@/lib/queries/admin/useAdminScrap'

export default function ScrapCards() {
  const { data: spotPrices = [] } = useSpotPrices()
  const editScrapPercentage = useEditScrapPercentages()

  const [weights, setWeights] = useState<Record<string, WeightOption>>({})
  const [editingStates, setEditingStates] = useState<Record<string, boolean>>({})

  const getPerWeightPrice = (spot: SpotPrice, weight: WeightOption) => {
    const scrapPricePerTroyOz = spot.bid_spot * spot.scrap_percentage
    return scrapPricePerTroyOz * convertTroyOz(1, weight.unit)
  }

  const handleUpdate = (id: string, scrap_percentage: number) => {
    editScrapPercentage.mutate({ id: id, scrap_percentage: scrap_percentage })
  }

  const toggleEditing = (id: string) => {
    setEditingStates(prev => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const setWeight = (id: string, weight: WeightOption) => {
    setWeights(prev => ({
      ...prev,
      [id]: weight,
    }))
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
      {spotPrices.map((spot) => {
        const icon = metalOptions.find((option) => spot.type === option.label)?.logo
        const currentWeight = weights[spot.id] ?? weightOptions[0]
        const editing = editingStates[spot.id] ?? false

        return (
          <div
            key={spot.id}
            className="flex items-center justify-between rounded-lg p-4 bg-card raised-off-page mt-4 w-full h-auto"
          >
            <div className="flex flex-col w-full">
              <div className="flex items-center w-full justify-between">
                <div className="flex items-center gap-2">
                  {icon}
                  <div className="text-neutral-800 text-lg">{spot.type}</div>
                </div>
                <div className="text-neutral-900 text-xl">
                  <PriceNumberFlow value={spot.bid_spot} />
                </div>
              </div>
              <div className="mt-6 flex flex-col">
                <div className="flex items-center w-full justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-base text-neutral-700">Price per</div>
                    <WeightSelect
                      value={currentWeight}
                      onChange={(value) => setWeight(spot.id, value)}
                    />
                  </div>
                  <div className="text-lg text-neutral-800">
                    <PriceNumberFlow value={getPerWeightPrice(spot, currentWeight)} />
                  </div>
                </div>
                <div className="flex items-center justify-between w-full">
                  <div className="text-base text-neutral-700">Percentage:</div>
                  {editing ? (
                    <div className='flex items-center gap-1'>
                      <Input
                        type="number"
                        pattern="[0-9]*"
                        className="input-floating-label-form no-spinner text-left w-14 text-lg md:text-lg h-6"
                        defaultValue={spot.scrap_percentage}
                        onBlur={(e) => handleUpdate(spot.id, Number(e.target.value))}
                      />
                      <Button variant="ghost" className="p-0" onClick={() => toggleEditing(spot.id)}>
                        <Check size={16} className='text-success' />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="text-lg text-neutral-800">{spot.scrap_percentage}</div>
                      <Button variant="ghost" className="p-0" onClick={() => toggleEditing(spot.id)}>
                        <Edit2 size={16} stroke={getPrimaryIconStroke()} />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
