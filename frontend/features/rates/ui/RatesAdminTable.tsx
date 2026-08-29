'use client'

import { useMemo } from 'react'

import { AdminRate } from '@/features/rates/types'
import { useAdminRates } from '@/features/rates/queries'
import RatesCard from '@/features/rates/ui/RatesCard'

export default function RatesPage() {
  const { data: rates = [], isLoading, isError } = useAdminRates()

  const byMetal = useMemo(() => {
    const m = new Map<string, AdminRate[]>()
    for (const r of rates) {
      const arr = m.get(r.metal) ?? []
      arr.push(r)
      m.set(r.metal, arr)
    }
    for (const [k, arr] of m) {
      // WAS `a.material === b.material ? a.min_qty - b.min_qty :
      // a.material.localeCompare(b.material)`. THERE IS NO `material` COLUMN -
      // rates.rates has none and neither wire shape carries one; the field
      // existed only on the hand-written type this file used to import. Both
      // sides read `undefined`, `undefined === undefined` is true, and the
      // localeCompare branch has never once executed. This is what ran.
      arr.sort((a, b) => a.min_qty - b.min_qty)
      m.set(k, arr)
    }
    return m
  }, [rates])

  if (isLoading) return <p className="p-6">Loading rates…</p>
  if (isError) return <p className="p-6 text-destructive">Failed to load rates.</p>

  return (
    <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-6">
      {[...byMetal.entries()].map(([metal, group]) => (
        <RatesCard key={metal} metal={metal} rates={group} />
      ))}
    </div>
  )
}