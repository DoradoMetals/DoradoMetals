'use client'

import * as React from 'react'
import {
  Button,
  Checkbox,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@dorado/components'
import { Boxes, Plus, Trash2 } from '@dorado/icons'
import type { Direction, LotUnlinkBody, OrderLotPatch } from '@dorado/contracts'

import { pluralize } from '../../_lib'
import { RemoveLotDialog } from '../../_components/RemoveLotDialog'
import { ORDER_ACTIONS, WEIGHT_LABELS, findAction, offers, type OrderAction } from '../_lib'
import { LotsRow, type LotsKind, type OrderLotRow } from './LotsRow'
import { OrderSection, type SectionContent } from './OrderSection'

export type LotsProps = {
  direction: Direction
  lots: OrderLotRow[] | undefined
  actions: readonly OrderAction[]
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  selected?: readonly string[]
  onSelectedChange?: (ids: string[]) => void
  onAdd?: () => void
  onCombine?: (ids: string[]) => void
  onRemove?: (ids: string[], body: LotUnlinkBody) => void
  onEdit?: (id: string, patch: OrderLotPatch) => void
  onAllocate?: (id: string) => void
  onRetry?: () => void
  lotHref?: (lotId: string) => string
  adding?: React.ReactNode
  removePending?: boolean
  askRemoveReason?: boolean
  defaultOpen?: boolean
}

export function Lots({
  direction,
  lots,
  actions,
  content = 'loaded',
  layout = 'desktop',
  selected = [],
  onSelectedChange,
  onAdd,
  onCombine,
  onRemove,
  onEdit,
  onAllocate,
  onRetry,
  lotHref,
  adding,
  removePending = false,
  askRemoveReason = false,
  defaultOpen = true,
}: LotsProps) {
  const [confirming, setConfirming] = React.useState(false)
  const kind: LotsKind = direction === 'sale' ? 'bullion' : 'scrap'
  const rows = lots ?? []
  const mobile = layout === 'mobile'
  const state: SectionContent = content === 'loaded' && rows.length === 0 ? 'empty' : content
  const some = selected.length > 0
  const editable = offers(actions, ORDER_ACTIONS.editLots)
  const canAdd = offers(actions, ORDER_ACTIONS.addLot) && onAdd != null
  const canCombineLots = offers(actions, ORDER_ACTIONS.combineLots)
  const canRemoveLots = offers(actions, ORDER_ACTIONS.removeLots)
  const canCombine = some && offers(actions, ORDER_ACTIONS.combineLots) && onCombine != null
  const canRemove = some && offers(actions, ORDER_ACTIONS.removeLots) && onRemove != null
  const removeAction = findAction(actions, ORDER_ACTIONS.removeLots)
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.id))

  const toggle = (id: string, on: boolean) =>
    onSelectedChange?.(
      on ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id)
    )

  const addButton = (
    <Button size="iconSm" aria-label="Add lot" disabled={!canAdd} onClick={onAdd}>
      <Plus aria-hidden />
    </Button>
  )

  const titleActions =
    adding ??
    (state === 'empty' ? (
      addButton
    ) : (
      <>
        {addButton}
        <Button
          variant="secondary"
          size="iconSm"
          aria-label="Combine lots"
          disabled={!canCombine}
          onClick={() => onCombine?.([...selected])}
        >
          <Boxes aria-hidden />
        </Button>
        <Button
          variant="secondary"
          intent="danger"
          size="iconSm"
          aria-label="Remove lots"
          disabled={!canRemove}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      </>
    ))

  const row = (lot: OrderLotRow) => (
    <LotsRow
      key={lot.id}
      lot={lot}
      kind={kind}
      layout={layout}
      editable={editable}
      selected={selected.includes(lot.id)}
      showSelect={onSelectedChange != null && (canCombineLots || canRemoveLots)}
      onSelectedChange={onSelectedChange ? (on) => toggle(lot.id, on) : undefined}
      onEdit={onEdit}
      onAllocate={onAllocate}
      lotHref={lotHref}
    />
  )

  return (
    <>
      <OrderSection
        title="Lots"
        layout={layout}
        content={state}
        actions={<span className="flex items-center gap-xs">{titleActions}</span>}
        summary={
          mobile ? pluralize(rows.length, 'item', 'items') : pluralize(rows.length, 'lot', 'lots')
        }
        emptyTitle="No lots yet"
        emptyDescription="Add the first lot to price this order."
        errorTitle="Couldn’t load lots"
        onRetry={onRetry}
        defaultOpen={defaultOpen}
      >
        {mobile ? (
          <div data-kind={kind} className="flex flex-col divide-y divide-border">
            {rows.map(row)}
          </div>
        ) : (
          <Table bare aria-label="Lots" data-kind={kind} className="[&>table]:table-fixed">
            <TableHeader className="[&>tr]:h-auto">
              <TableRow className="h-auto">
                <TableHead className="w-10 pb-xs">
                  <Checkbox
                    aria-label="Select all lots"
                    checked={allChecked}
                    disabled={onSelectedChange == null}
                    onCheckedChange={(next) =>
                      onSelectedChange?.(next === true ? rows.map((lot) => lot.id) : [])
                    }
                  />
                </TableHead>
                <TableHead className="pb-xs">Item</TableHead>
                <TableHead className="w-14 pb-xs text-center">Qty</TableHead>
                {kind === 'scrap' && (
                  <>
                    <TableHead className="w-[118px] pb-xs text-center">
                      {WEIGHT_LABELS.gross}
                    </TableHead>
                    <TableHead className="w-[118px] pb-xs text-center">
                      {WEIGHT_LABELS.net}
                    </TableHead>
                    <TableHead className="w-[104px] pb-xs text-center">Purity</TableHead>
                  </>
                )}
                <TableHead className="w-[104px] pb-xs text-center">Premium</TableHead>
                <TableHead numeric className="w-[104px] pb-xs">
                  Price
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&>tr]:h-auto">{rows.map(row)}</TableBody>
          </Table>
        )}
      </OrderSection>
      <RemoveLotDialog
        open={confirming}
        layout={layout}
        pending={removePending}
        askReason={askRemoveReason}
        body={removeAction?.confirm ?? undefined}
        onCancel={() => setConfirming(false)}
        onConfirm={(body) => {
          setConfirming(false)
          onRemove?.([...selected], body)
        }}
      />
    </>
  )
}
