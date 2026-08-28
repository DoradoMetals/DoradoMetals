'use client'

import { useMemo } from 'react'

import { Rate } from '@/features/rates/types'
import { useAdminRates } from '@/features/rates/queries'
import RatesCard from '@/features/rates/ui/RatesCard'

export default function RatesPage() {
  const { data: rates = [], isLoading, isError } = useAdminRates()

  const byMetal = useMemo(() => {
    const m = new Map<string, Rate[]>()
    for (const r of rates) {
      const arr = m.get(r.metal) ?? []
      arr.push(r)
      m.set(r.metal, arr)
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => (a.material === b.material ? a.min_qty - b.min_qty : a.material.localeCompare(b.material)))
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