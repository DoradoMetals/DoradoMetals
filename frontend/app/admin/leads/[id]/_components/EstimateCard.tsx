'use client'

import * as React from 'react'
import {
  Button,
  DataTable,
  type DataTableColumn,
  Drawer,
  DrawerBody,
  DrawerHeader,
  EmptyState,
  PhotoViewer,
  Text,
  UploadDrawer,
} from '@dorado/components'
import { ImageIcon, Package, Paperclip, Plus, Trash2 } from '@dorado/icons'
import type {
  EstimateItemPatch,
  EstimateItemView,
  LeadEstimate,
  LeadLookup,
  PurityLookup,
  WeightUnitLookup,
} from '@dorado/contracts'

import {
  DASH,
  formatEstimate,
  formatGrams,
  formatMoney,
  formatPurity,
  formatRate,
  formatWeight,
  unitShort,
} from '../../_lib'
import { useItemImages } from '../_api'
import { AddItemDrawer } from './AddItemDrawer'

type Row = {
  id: string
  name: string
  type: string
  weight: string
  purity: string
  rate: string
  value: string
  images: number
}

function ItemName({ row }: { row: Row }) {
  return (
    <span className="inline-flex items-center gap-xs">
      {row.name}
      {row.images > 0 && (
        <span className="inline-flex items-center gap-3xs text-micro text-muted-foreground">
          <ImageIcon aria-label="Images" className="size-3.5" />
          <span>{String(row.images)}</span>
        </span>
      )}
    </span>
  )
}

const columns: DataTableColumn<Row>[] = [
  {
    id: 'name',
    header: 'Item',
    meta: { primary: true, fill: true },
    cell: ({ row }) => <ItemName row={row.original} />,
  },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'weight', header: 'Weight', meta: { numeric: true } },
  { accessorKey: 'purity', header: 'Purity', meta: { numeric: true } },
  { accessorKey: 'rate', header: 'Rate', meta: { numeric: true } },
  { accessorKey: 'value', header: 'Value', meta: { numeric: true, primary: true } },
]

function ItemPhotos({ leadId, itemId, title }: { leadId: string; itemId: string; title: string }) {
  const images = useItemImages(leadId, itemId).data ?? []
  const [index, setIndex] = React.useState(0)
  const at = Math.min(index, Math.max(images.length - 1, 0))
  return (
    <PhotoViewer
      title={title}
      photos={images.map((image, position) => ({ src: image.url, alt: `Photo ${position + 1}` }))}
      index={at}
      onIndexChange={setIndex}
      count={images.length > 0 ? `${at + 1} of ${images.length}` : undefined}
    />
  )
}

export type EstimateCardProps = {
  layout?: 'desktop' | 'mobile'
  leadId: string
  items: EstimateItemView[] | undefined
  estimate: LeadEstimate | undefined
  failed: boolean
  onRetry: () => void
  kinds: LeadLookup[]
  units: WeightUnitLookup[]
  purities: PurityLookup[]
  adding: boolean
  onAdd: (item: EstimateItemPatch, done: () => void) => void
  onRemove: (itemIds: string[]) => void
  onAttach: (itemId: string, files: File[], done: () => void) => void
  attaching: boolean
}

export function EstimateCard({
  layout = 'desktop',
  leadId,
  items,
  estimate,
  failed,
  onRetry,
  kinds,
  units,
  purities,
  adding,
  onAdd,
  onRemove,
  onAttach,
  attaching,
}: EstimateCardProps) {
  const [drawer, setDrawer] = React.useState(false)
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [files, setFiles] = React.useState<File[]>([])
  const [viewing, setViewing] = React.useState<Row | null>(null)

  const rows: Row[] = React.useMemo(
    () =>
      (items ?? []).map((item) => {
        const label = purities.find((row) => row.id === item.purity_id)
        const unitKey = units.find((row) => row.id === item.unit_id)?.key ?? ''
        const line = estimate?.items.find((entry) => entry.id === item.id)
        const fineness = line?.purity ?? label?.purity ?? item.custom_purity
        return {
          id: item.id,
          name: `${label?.label ?? (item.custom_purity != null ? formatPurity(item.custom_purity) : '')} ${item.metal_id}`.trim(),
          type: kinds.find((row) => row.id === item.kind_id)?.label ?? DASH,
          weight: formatWeight(item.weight, unitShort(unitKey)),
          purity: fineness == null ? DASH : formatPurity(fineness),
          rate: line ? formatRate(line.premium) : '',
          value: line ? formatMoney(line.value) : DASH,
          images: item.image_count,
        }
      }),
    [items, estimate, kinds, units, purities]
  )

  const totalGrams = items?.[0]?.total_grams

  const actions = ({ selected }: { selected: Row[] }) => {
    const one = selected.length === 1 ? selected[0]! : null
    return (
      <div className="flex items-center gap-xs">
        <Button size="iconSm" aria-label="Add item" onClick={() => setDrawer(true)}>
          <Plus aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label="Attach images"
          disabled={one == null}
          onClick={() => {
            setFiles([])
            setUploading(one?.id ?? null)
          }}
        >
          <Paperclip aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="iconSm"
          aria-label="View images"
          disabled={one == null}
          onClick={() => setViewing(one)}
        >
          <ImageIcon aria-hidden />
        </Button>
        <Button
          variant="secondary"
          intent="danger"
          size="iconSm"
          aria-label="Delete items"
          disabled={selected.length === 0}
          onClick={() => onRemove(selected.map((row) => row.id))}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <div data-testid="lead-card-estimate" className="flex flex-col">
      <DataTable
        label="Estimate"
        title="Estimate"
        layout={layout}
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        selectable
        actions={actions}
        loading={items === undefined && !failed}
        error={failed ? "Couldn't load the estimate" : undefined}
        empty={
          <EmptyState
            icon={<Package aria-hidden />}
            title="No items yet"
            description="Add what the lead described to price an estimate."
          />
        }
        mobileRow={(row) => (
          <div className="flex flex-col gap-3xs px-md py-sm">
            <div className="flex items-center justify-between gap-xs">
              <ItemName row={row} />
              <Text variant="small">{row.value}</Text>
            </div>
            <Text variant="micro" className="text-muted-foreground">
              {[row.type, row.weight, row.purity, row.rate].join(' ')}
            </Text>
          </div>
        )}
      />
      {failed && (
        <Button variant="secondary" size="sm" className="self-start" onClick={onRetry}>
          Try again
        </Button>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-xs rounded-lg border border-border bg-card px-md py-sm">
          <div className="flex items-center justify-between">
            <Text variant="small" className="text-muted-foreground">
              Total weight
            </Text>
            <Text variant="small-medium">
              {totalGrams == null ? DASH : formatGrams(totalGrams)}
            </Text>
          </div>
          <div className="flex items-center justify-between">
            <Text variant="small" className="text-muted-foreground">
              Estimated total
            </Text>
            <Text variant="small-medium">{estimate ? formatEstimate(estimate.total) : DASH}</Text>
          </div>
        </div>
      )}

      <AddItemDrawer
        open={drawer}
        setOpen={setDrawer}
        layout={layout}
        kinds={kinds}
        units={units}
        purities={purities}
        pending={adding}
        onAdd={(item) => onAdd(item, () => setDrawer(false))}
      />

      <UploadDrawer
        open={uploading != null}
        setOpen={(open) => !open && setUploading(null)}
        title="Attach images"
        accept="image/*"
        multiple
        fileCount={files.length}
        onFiles={setFiles}
        canUpload={files.length > 0 && !attaching}
        onUpload={() => uploading && onAttach(uploading, files, () => setUploading(null))}
      />

      <Drawer
        open={viewing != null}
        setOpen={(open) => !open && setViewing(null)}
        size={layout === 'mobile' ? 'full' : 'lg'}
        label="Item images"
      >
        <DrawerHeader title="Item images" />
        <DrawerBody>
          {viewing && <ItemPhotos leadId={leadId} itemId={viewing.id} title={viewing.name} />}
        </DrawerBody>
      </Drawer>
    </div>
  )
}
