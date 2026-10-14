'use client'

import { formatStamp } from '@/shared/utils/formatStamp'
import { useState } from 'react'
import { useUserNames } from '@dorado/client'
import { userNameOf } from '@/shared/ui/UserName'
import { Button, Select, Skeleton, useDebounce, useMediaUp } from '@dorado/components'
import type { RatePay } from '@dorado/contracts'

import { PricingHeader } from '../../_components'
import { DEFAULT_UNIT, WEIGHT_UNITS } from '../_lib'
import { useBands, useChanges, useRateRows, useReplaceRateBands } from '../_api'
import { lastChange } from '../_lib'
import { MetalRatesCard, type RateType } from './MetalRatesCard'
import { RateChangesPanel } from './RateChangesPanel'

const TYPE_ITEMS = [
  { value: 'all', label: 'All types' },
  { value: 'scrap', label: 'Scrap' },
  { value: 'bullion', label: 'Bullion' },
]

const metalsOf = (bands: RatePay[]) => [...new Set(bands.map((band) => band.metal_id))]

export function RatesScreen() {
  const mobile = !useMediaUp('lg')
  const [unit, setUnit] = useState(DEFAULT_UNIT)
  const [type, setType] = useState<RateType>('all')
  const [metal, setMetal] = useState('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounce(search, 300)

  const bands = useBands(unit).data
  const rows = useRateRows().data ?? []
  const changes = useChanges(q.trim() === '' ? null : q.trim(), page).data
  const replace = useReplaceRateBands(unit)
  const names = useUserNames(rows.map((row) => row.updated_by_id ?? row.created_by_id)).data

  const metals = bands ? metalsOf(bands) : []
  const shown = metal === 'all' ? metals : metals.filter((entry) => entry === metal)
  const changePages = changes ? Math.max(1, Math.ceil(changes.total / changes.page_size)) : 1

  const unitSelect = (
    <Select
      label="Unit"
      items={WEIGHT_UNITS.map(({ value, label }) => ({ value, label }))}
      value={unit}
      onValueChange={setUnit}
      className={mobile ? undefined : 'w-70'}
    />
  )

  return (
    <>
      <PricingHeader
        section="rates"
        mobile={mobile}
        description={
          mobile
            ? 'Global default rates by weight band'
            : 'Global default rates by weight band · applied to every order unless it overrides them'
        }
        selects={
          mobile ? (
            unitSelect
          ) : (
            <>
              {unitSelect}
              <Select
                label="Type"
                items={TYPE_ITEMS}
                value={type}
                onValueChange={(value) => setType(value as RateType)}
                className="w-45"
              />
              <Select
                label="Metal"
                items={[
                  { value: 'all', label: 'All metals' },
                  ...metals.map((entry) => ({ value: entry, label: entry })),
                ]}
                value={metal}
                onValueChange={setMetal}
                className="w-45"
              />
            </>
          )
        }
        reset={
          mobile ? undefined : (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setUnit(DEFAULT_UNIT)
                setType('all')
                setMetal('all')
              }}
            >
              Reset
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 items-start gap-md lg:grid-cols-2 lg:gap-lg">
        {bands === undefined
          ? Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} shape="block" className="h-75" />
            ))
          : shown.map((metalId) => {
              const last = lastChange(rows, metalId)
              const own = bands.filter((band) => band.metal_id === metalId)
              return (
                <MetalRatesCard
                  key={`${metalId}:${editing === metalId}`}
                  metalId={metalId}
                  bands={own}
                  type={type}
                  mobile={mobile}
                  changed={
                    last
                      ? `Changed ${formatStamp(last.updated_at)} by ${userNameOf(names, last.updated_by_id ?? last.created_by_id)}`
                      : ''
                  }
                  editing={editing === metalId}
                  pending={replace.isPending}
                  error={editing === metalId ? (replace.error?.message ?? null) : null}
                  onEdit={() => {
                    replace.reset()
                    setEditing(metalId)
                  }}
                  onCancel={() => {
                    replace.reset()
                    setEditing(null)
                  }}
                  onDirty={() => replace.reset()}
                  onSave={(body) =>
                    replace.mutate({ metalId, body }, { onSuccess: () => setEditing(null) })
                  }
                />
              )
            })}
      </div>

      <RateChangesPanel
        rows={changes?.items}
        mobile={mobile}
        search={search}
        page={page}
        pageCount={changePages}
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
        onPageChange={setPage}
      />
    </>
  )
}
