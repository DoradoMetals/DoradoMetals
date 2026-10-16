'use client'

import * as React from 'react'
import { Button, Checkbox, Link, TableCell, TableRow, Text } from '@dorado/components'
import type { OrderLotPatch, OrderLotView } from '@dorado/contracts'

import { formatTotal } from '../../_lib'
import { WEIGHT_LABELS, formatDecimal, formatFixed, percentToRatio, ratioToPercent } from '../_lib'
import { DecimalField } from './DecimalField'

export type OrderLotRow = OrderLotView & { stock_short?: boolean }

export type LotsKind = 'scrap' | 'bullion'

export type LotsRowProps = {
  lot: OrderLotRow
  kind: LotsKind
  layout?: 'desktop' | 'mobile'
  editable?: boolean
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
  onEdit?: (id: string, patch: OrderLotPatch) => void
  onAllocate?: (id: string) => void
  lotHref?: (lotId: string) => string
}

const percentText = (value: number | null | undefined) => formatDecimal(value)

export function LotsRow({
  lot,
  kind,
  layout = 'desktop',
  editable = false,
  selected = false,
  onSelectedChange,
  onEdit,
  onAllocate,
  lotHref,
}: LotsRowProps) {
  const bullion = lot.lot.bullion_id != null
  const unit = lot.lot.unit
  const commit = editable && onEdit ? (patch: OrderLotPatch) => onEdit(lot.id, patch) : undefined
  const price = lot.line_total == null ? '—' : formatTotal(lot.line_total)
  const reference = lot.lot.reference

  const field = (
    key: 'quantity' | 'pre_melt' | 'post_melt' | 'purity' | 'premium',
    label: string
  ) => {
    const ratio = key === 'purity' || key === 'premium'
    const raw = lot.lot[key]
    const fixed = key === 'post_melt'
    return (
      <DecimalField
        label={layout === 'mobile' ? label : undefined}
        ariaLabel={layout === 'mobile' ? undefined : `${label}, ${lot.name}`}
        value={ratio ? ratioToPercent(raw) : raw}
        format={fixed ? formatFixed : ratio ? percentText : formatDecimal}
        unit={key === 'quantity' ? undefined : ratio ? '%' : unit}
        onCommit={
          commit
            ? (next) => commit({ [key]: ratio ? percentToRatio(next) : next } as OrderLotPatch)
            : undefined
        }
      />
    )
  }

  const allocate = lot.stock_short && (
    <Button
      variant="tertiary"
      size="sm"
      className="self-start"
      disabled={onAllocate == null}
      onClick={() => onAllocate?.(lot.id)}
    >
      Allocate from inventory
    </Button>
  )

  const check = (
    <Checkbox
      aria-label={`Select ${lot.name}`}
      checked={selected}
      disabled={onSelectedChange == null}
      onCheckedChange={(next) => onSelectedChange?.(next === true)}
    />
  )

  if (layout === 'mobile') {
    return (
      <div
        data-layout="mobile"
        data-type={bullion ? 'bullion' : 'scrap'}
        data-selected={selected ? 'true' : undefined}
        className="flex flex-col gap-sm py-xs"
      >
        <div className="flex items-center justify-between gap-3xs">
          <span className="flex items-center gap-xs">
            {check}
            <Text variant="small">{lot.name}</Text>
          </span>
          <Text variant="micro" className="text-muted-foreground">
            {price}
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-sm">
          {bullion ? (
            <>
              {field('quantity', 'Qty')}
              {field('premium', 'Premium')}
            </>
          ) : (
            <>
              {field('pre_melt', WEIGHT_LABELS.gross)}
              {field('post_melt', WEIGHT_LABELS.net)}
              {field('purity', 'Purity')}
              {field('premium', 'Premium')}
            </>
          )}
        </div>
        {allocate}
      </div>
    )
  }

  const dash = <Text variant="small">—</Text>

  return (
    <TableRow data-type={bullion ? 'bullion' : 'scrap'} selected={selected} className="h-auto">
      <TableCell className="w-4 py-xs">{check}</TableCell>
      <TableCell fill className="py-xs">
        <div className="flex flex-col gap-3xs">
          {lotHref ? (
            <Link href={lotHref(lot.lot_id)}>{lot.name}</Link>
          ) : (
            <Text variant="small-medium">{lot.name}</Text>
          )}
          {reference != null &&
            (lotHref ? (
              <Link href={lotHref(lot.lot_id)} intent="muted" className="micro">
                {reference}
              </Link>
            ) : (
              <Text variant="micro" className="text-muted-foreground">
                {reference}
              </Text>
            ))}
          {allocate}
        </div>
      </TableCell>
      <TableCell className="w-14 py-xs text-center">
        {bullion ? field('quantity', 'Qty') : dash}
      </TableCell>
      {kind === 'scrap' && (
        <>
          <TableCell className="w-[118px] py-xs text-center">
            {bullion ? dash : field('pre_melt', WEIGHT_LABELS.gross)}
          </TableCell>
          <TableCell className="w-[118px] py-xs text-center">
            {bullion ? dash : field('post_melt', WEIGHT_LABELS.net)}
          </TableCell>
          <TableCell className="w-[104px] py-xs text-center">
            {bullion ? dash : field('purity', 'Purity')}
          </TableCell>
        </>
      )}
      <TableCell className="w-[104px] py-xs">{field('premium', 'Premium')}</TableCell>
      <TableCell numeric primary className="w-[104px] py-xs">
        {price}
      </TableCell>
    </TableRow>
  )
}
