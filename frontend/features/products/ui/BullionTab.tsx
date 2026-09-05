'use client'

import { useState } from 'react'
import { Button, FieldLabel, Input, RadioGroup, RadioOption, Switch } from '@dorado/components'
import { X } from '@dorado/icons'
import { useMetals, useProducts } from '@dorado/client'
import BullionCard from '@/features/products/ui/BullionCard'

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
    metal_id: metal,
    search: search || undefined,
    generic: !branded,
  })


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
            value={option.id}
            variant="segment"
            className="w-full"
            onClick={(e) => {
              if (metal === option.id) {
                e.preventDefault() // prevents Radix from swallowing the click
                setMetal(undefined)
              }
            }}
          >
            {option.id}
          </RadioOption>
        ))}
      </RadioGroup>

      <Input
        label="Search Products"
        className="mt-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        trailing={
          search ? (
            <Button
              type="button"
              variant="tertiary"
              size="iconXs"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              <X size={14} />
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6 sm:gap-8 mt-4">
        {groups.map((group) => (
          <BullionCard
            key={group.default.id}
            product={group.default}
            variants={group.variants}
          />
        ))}
      </div>
    </div>
  )
}
