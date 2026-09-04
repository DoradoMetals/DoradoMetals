'use client'

import { useState } from 'react'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import { Button, FieldLabel, RadioGroup, RadioOption, Switch } from '@dorado/components'
import { X } from '@dorado/icons'
import { useMetals, useProducts } from '@dorado/client'
import BullionCard from '@/features/products/ui/BullionCard'
import { useCatalogQuote } from '@/features/quotes/queries'
import { catalogQuoteItems, unitPricesById } from '@/features/quotes/catalogPrices'

// EVERY PRODUCT MAY BE SOLD BACK (ruling 49), so this list has no gate. The
// metal filter, the search box and the generic/branded split are QUERY PARAMS
// now: the browser used to hold the whole catalogue, filter it by metal, run a
// fuzzy match over a `${name} ${metal}` string it built per keystroke, and
// then partition it on `is_generic`.
export default function BullionTab() {
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [metal, setMetal] = useState<string | undefined>(undefined)

  // A search means "look everywhere", so it lifts the generic split the same
  // way it always did.
  const searching = search !== ''
  const branded = searching || showAll

  const { data: metals = [] } = useMetals()
  const { data: groups = [] } = useProducts({
    side: 'bid',
    metal,
    search: search || undefined,
    generic: !branded,
  })

  // ONE bid quote for the list. The key is the ids that came back, so a
  // filter change is a new quote rather than a stale one.
  const { data: quote } = useCatalogQuote(catalogQuoteItems(groups), 'bid')
  const unitPrices = unitPricesById(quote)

  return (
    <div className="relative flex flex-col gap-2 mt-8 mb-8 w-full">
      <div className="flex items-center justify-between w-full gap-2">
        <FieldLabel htmlFor="show-generics">Show All Products</FieldLabel>
        <Switch
          id="show-generics"
          checked={branded}
          onCheckedChange={setShowAll}
          disabled={searching}
        />
      </div>

      <RadioGroup
        value={metal ?? 'All'}
        onValueChange={(value) => setMetal(value === 'All' ? undefined : value)}
        className="grid grid-cols-4 gap-2"
      >
        {metals.map((option) => (
          <RadioOption
            key={option.id}
            value={option.name}
            variant="segment"
            className="w-full"
            onClick={(e) => {
              if (metal === option.name) {
                e.preventDefault() // prevents Radix from swallowing the click
                setMetal(undefined)
              }
            }}
          >
            {option.name}
          </RadioOption>
        ))}
      </RadioGroup>

      <div className="relative w-full mt-4">
        <FloatingLabelInput
          label="Search Products"
          size="sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <Button
            variant="tertiary"
            size="icon"
            onClick={() => setSearch('')}
            className="absolute right-1 top-1/2 -translate-y-1/2"
            tabIndex={-1}
          >
            <X size={16} />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 sm:gap-8 mt-4">
        {groups.map((group) => (
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
