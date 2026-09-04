'use client'

import USMap from '@/features/sales-tax/ui/USMap'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Autocomplete } from '@dorado/components'
import { stateTaxData, StateTaxDetail } from '@/features/sales-tax/types'

export default function Page() {
  const [selected, setSelected] = useState<StateTaxDetail | null>(null)
  const [query, setQuery] = useState('')
  const allStates = Object.values(stateTaxData)
  const stateItems = useMemo(
    () =>
      allStates
        .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
        .map((s) => ({ id: s.fips, textValue: s.name })),
    [allStates, query]
  )

  return (
    <main className="flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <USMap selected={selected} setSelected={setSelected} />
        <div className="w-full p-4">
          <div className="flex flex-col items-start w-full gap-1 mb-6">
            <p>
              Please select a state on the map or in the search below to see the sales tax
              breakdown.
            </p>
            <div className="w-full">
              <Autocomplete
                value={query}
                onValueChange={setQuery}
                items={stateItems}
                onSelect={(item) => {
                  const state = allStates.find((s) => s.fips === item.id)
                  if (state) {
                    setSelected(state)
                    setQuery(state.name)
                  }
                }}
                placeholder="Search states…"
              />
            </div>
          </div>
          {selected && (
            <div className="bg-card border border-border rounded-lg p-4 w-full flex flex-col gap-3">
              <div className="flex items-center w-full justify-between border-b border-border py-2">
                <h2>{selected?.name}</h2>
                <Image
                  src={`/icons/flags/${selected.name}.svg`}
                  height={40}
                  width={40}
                  className="object-cover"
                  alt="thumbnail front"
                />
              </div>
              <p>{selected?.header}</p>
              {selected?.bullets && selected?.bullets.length > 0 && (
                <ul className="mt-2">
                  {selected!.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
