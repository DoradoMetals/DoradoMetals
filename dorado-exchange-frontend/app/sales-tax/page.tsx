'use client'

import USMap from '@/features/sales-tax/ui/USMap'
import Image from 'next/image'
import { useState } from 'react'
import { StateTaxDetail, stateTaxData } from '@/types/tax'
import { SearchableDropdown } from '@/shared/ui/inputs/InputDropdownSearch'

export default function Page() {
  const [selected, setSelected] = useState<StateTaxDetail | null>(null)
  const allStates = Object.values(stateTaxData)

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <USMap selected={selected} setSelected={setSelected} />
        <div className="w-full p-4">
          <div className="flex flex-col items-start w-full gap-1 mb-6">
            <div className="text-xs text-neutral-700">
              Please select a state on the map or in the search below to see the sales tax
              breakdown.
            </div>
            <div className="w-full">
              <SearchableDropdown
                items={allStates}
                getLabel={(s) => s.name}
                selected={selected}
                onSelect={setSelected}
                placeholder="Search states…"
                limit={50}
                inputClassname="input-floating-label-form"
              />
            </div>
          </div>
          {selected && (
            <div className="bg-card rounded-lg p-4 w-full flex flex-col gap-3 raised-off-page">
              <div className="flex items-center w-full justify-between border-b border-border py-2">
                <div className="text-xl text-neutral-800 tracking-wide">{selected?.name}</div>
                <Image
                  src={`/icons/flags/${selected.name}.svg`}
                  height={40}
                  width={40}
                  className="object-cover"
                  alt="thumbnail front"
                />
              </div>
              <div className="text-sm text-neutral-600">{selected?.header}</div>
              {selected?.bullets && selected?.bullets.length > 0 && (
                <ul className="list-disc list-outside mt-2 space-y-1 text-sm text-neutral-900 ml-6">
                  {selected!.bullets.map((bullet, i) => (
                    <li key={i} className="-pl-12">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
