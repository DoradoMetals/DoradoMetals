'use client'

import { useMemo } from 'react'
import { useAdminRates } from '@/lib/queries/useRates'
import { Rate } from '@/types/rates'
import RatesCard from './ratesCard'

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

  if (isLoading) return <div className="p-6 text-sm text-neutral-600">Loading rates…</div>
  if (isError) return <div className="p-6 text-sm text-destructive">Failed to load rates.</div>

  return (
    <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-6">
      {[...byMetal.entries()].map(([metal, group]) => (
        <RatesCard key={metal} metal={metal} rates={group} className="raised-off-page" />
      ))}
    </div>
  )
}