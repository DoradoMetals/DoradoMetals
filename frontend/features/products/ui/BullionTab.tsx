import { useState } from 'react'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import fuzzysort from 'fuzzysort'
import { Button, FieldLabel, RadioGroup, RadioOption, Switch } from '@dorado/components'
import { X } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { useSellProducts } from '@/features/products/queries'
import BullionCard from '@/features/products/ui/BullionCard'
import { useCatalogQuote } from '@/features/quotes/queries'
import { catalogQuoteItems, unitPricesById } from '@/features/quotes/catalogPrices'

export default function BullionTab() {
  const { data: bullionProducts = [] } = useSellProducts()

  // ONE bid quote for the whole sell list, filtered or not - quoting the full
  // list rather than the visible subset keeps the query key stable while the
  // customer types or filters, and every card reads its selected id out of
  // the map. Never a quote per card.
  const { data: quote } = useCatalogQuote(catalogQuoteItems(bullionProducts), 'bid')
  const unitPrices = unitPricesById(quote)
  const [input, setInput] = useState('')
  const [showGenerics, setShowGenerics] = useState(false)

  const isInputActive = input !== ''
  const isShowAll = isInputActive || showGenerics

  const metalOptions = ['Gold', 'Silver', 'Platinum', 'Palladium']
  const [selectedMetal, setSelectedMetal] = useState('All')

  const filtered =
    selectedMetal === 'All'
      ? bullionProducts
      : bullionProducts.filter((p) => p.default.metal_type === selectedMetal)

  const filteredBullion = input
    ? fuzzysort
        .go(
          input,
          filtered.map((p) => ({
            ...p,
            searchText: `${p.default.name} ${p.default.metal_type}`,
          })),
          {
            keys: ['searchText'],
            limit: 50,
            threshold: -10000,
          }
        )
        .map((r) => r.obj)
    : filtered

  const displayedBullion = isShowAll
    ? filteredBullion.filter((group) => !group.default.is_generic)
    : filteredBullion.filter((group) => group.default.is_generic)

  const handleClear = () => {
    setInput('')
  }

  return (
    <div className="relative flex flex-col gap-2 mt-8 mb-8 w-full">
      <div className="flex items-center justify-between w-full gap-2">
        <FieldLabel htmlFor="show-generics">Show All Products</FieldLabel>
        <Switch
          id="show-generics"
          checked={isShowAll}
          onCheckedChange={(val) => setShowGenerics(val)}
          disabled={isInputActive}
        />
      </div>

      <RadioGroup
        value={selectedMetal}
        onValueChange={setSelectedMetal}
        className="grid grid-cols-4 gap-2"
      >
        {metalOptions.map((label) => (
          <RadioOption
            key={label}
            value={label}
            variant="segment"
            className="w-full"
            onClick={(e) => {
              if (selectedMetal === label) {
                e.preventDefault() // prevents Radix from swallowing the click
                setSelectedMetal('All')
              }
            }}
          >
            {label}
          </RadioOption>
        ))}
      </RadioGroup>

      <div className="relative w-full mt-4">
        <FloatingLabelInput
          label="Search Products"
          size="sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {input && (
          <Button
            variant="tertiary"
            size="icon"
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2"
            tabIndex={-1}
          >
            <X size={16} />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 sm:gap-8 mt-4">
        {displayedBullion.map((group) => (
          <BullionCard
            key={group.default.id}
            product={group.default}
            variants={group.variants}
            unitPrices={unitPrices}
          />
        ))}
      </div>
    </div>
  )
}
