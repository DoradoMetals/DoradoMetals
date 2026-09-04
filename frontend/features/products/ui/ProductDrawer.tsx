'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { useEffect, useMemo, useState } from 'react'
import { formatFullDate } from '@/shared/utils/formatDates'
import UpdatedByline from '@/shared/ui/UpdatedByline'
import { useSpotPrices } from '@/features/spots/queries'
import PremiumControl from '@/features/products/ui/PremiumControl'
import QuantityBar from '@/features/products/ui/QuantityInput'
import { SegmentedField } from '@/shared/ui/SegmentedField'
import {
  useAdminTypes,
  useSaveProduct,
  useAdminMetals,
  useAdminMints,
  useAdminSuppliers,
} from '@/features/products/queries'
import { AdminProduct } from '@/features/products/types'
import { Autocomplete, Badge, Divider, Drawer, Input, Textarea } from '@dorado/components'

export default function ProductDrawer({
  products,
  product_id,
}: {
  products: AdminProduct[]
  product_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'product'

  const product = useMemo(() => products.find((p) => p.id === product_id), [products, product_id])

  if (!product) {
    return null
  }

  return (
    <Drawer label="Product" open={isDrawerOpen} setOpen={closeDrawer}>
      <Header product={product} />
      <Divider />
      <Details product={product} />
      <Divider />
      <Inventory product={product} />
      <Divider />
      <Specifications product={product} />
      <Divider />
      <Displays product={product} />
      <Divider />
      <Dev product={product} />
      <Divider />
      <Images product={product} />
    </Drawer>
  )
}

function Header({ product }: { product: AdminProduct }) {
  const activeProduct = product.display

  return (
    <div className="flex flex-col w-full gap-8">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1">
          <img src={product.image_front ?? ''} alt={`product image`} height={50} width={50} />
          <h3>{product.name}</h3>
        </div>
        <Badge variant="soft" intent={activeProduct ? 'success' : 'danger'} size="lg">
          {activeProduct ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <UpdatedByline name={product.updated_by} date={formatFullDate(product.updated_at)} />
    </div>
  )
}

function Details({ product }: { product: AdminProduct }) {
  const { data: metals = [] } = useAdminMetals()
  const { data: suppliers = [] } = useAdminSuppliers()
  const { data: mints = [] } = useAdminMints()
  const { data: types = [] } = useAdminTypes()
  const saveProduct = useSaveProduct()

  const handleUpdate = (id: string, updatedFields: Partial<AdminProduct>) => {
    const updated = { ...product, ...updatedFields }
    saveProduct.mutate(updated)
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>
      <Input
        id="name"
        label="Product Name"
        placeholder="Enter name..."
        type="text"
        defaultValue={product.name ?? ''}
        onBlur={(e) => handleUpdate(product.id, { name: e.target.value })}
      />
      <div className="flex w-full justify-between items-center gap-4">
        <PickerField
          label="Metal"
          value={product.metal}
          options={metals?.map((m) => m.name) ?? []}
          onChange={(val) => handleUpdate(product.id, { metal: val })}
        />
        <PickerField
          label="Product Type"
          value={product.type}
          options={types?.map((item) => item.name) ?? []}
          onChange={(val) => handleUpdate(product.id, { type: val })}
        />
      </div>
      <PickerField
        label="Supplier"
        value={product.supplier}
        options={suppliers?.map((item) => item.organization.name ?? '') ?? []}
        onChange={(val) => handleUpdate(product.id, { supplier: val })}
      />
      <PickerField
        label="Mint"
        value={product.mint}
        options={mints?.map((item) => item.name) ?? []}
        onChange={(val) => handleUpdate(product.id, { mint: val })}
      />

      <Textarea
        rows={20}
        id="description"
        label="Description"
        placeholder="Enter product description..."
        className="min-w-70"
        defaultValue={product.description}
        onBlur={(e) => handleUpdate(product.id, { description: e.target.value })}
      />
    </div>
  )
}

/* PopoverSelect (button trigger -> popover list) becomes an Autocomplete
   (type-to-filter text field): the library ships no click-to-open,
   pick-from-a-fixed-list control, so this admin picker now filters `options`
   as the text is typed and only commits `onChange` when an item is chosen -
   typed text that matches nothing simply never commits. */
function PickerField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: string[]
  onChange: (value: string) => void
}) {
  const [text, setText] = useState(value ?? '')

  useEffect(() => {
    setText(value ?? '')
  }, [value])

  const items = options
    .filter((o) => o.toLowerCase().includes(text.trim().toLowerCase()))
    .map((o) => ({ id: o, textValue: o }))

  return (
    <Autocomplete
      label={label}
      placeholder="Select..."
      value={text}
      onValueChange={setText}
      items={items}
      onSelect={(item) => {
        setText(item.textValue)
        onChange(item.textValue)
      }}
      className="w-full"
    />
  )
}

function Inventory({ product }: { product: AdminProduct }) {
  const saveProduct = useSaveProduct()

  const handleUpdate = (id: string, updatedFields: Partial<AdminProduct>) => {
    const updated = { ...product, ...updatedFields }
    saveProduct.mutate(updated)
  }

  const { data: spots = [] } = useSpotPrices()
  const spot = spots.find((s) => s.name === product.metal)
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Inventory</p>

      <PremiumControl
        label="Bid Premium"
        value={product.bid_premium}
        spotPerOz={spot?.bid ?? 0}
        contentOz={product.content ?? 1}
        onChange={(mult) => handleUpdate(product.id, { bid_premium: mult })}
      />

      <PremiumControl
        label="Ask Premium"
        value={product.ask_premium}
        spotPerOz={spot?.ask ?? 0}
        contentOz={product.content ?? 1}
        onChange={(mult) => handleUpdate(product.id, { ask_premium: mult })}
      />

      <QuantityBar
        label="Quantity"
        value={product.quantity ?? 0}
        onChange={(q) => handleUpdate(product.id, { quantity: q })}
      />
    </div>
  )
}

function Specifications({ product }: { product: AdminProduct }) {
  const saveProduct = useSaveProduct()

  const handleUpdate = (id: string, updatedFields: Partial<AdminProduct>) => {
    const updated = { ...product, ...updatedFields }
    saveProduct.mutate(updated)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Specifications</p>

      <Input
        id="content"
        label="Content"
        inputMode="decimal"
        placeholder="Enter content..."
        type="number"
        inputClassName="text-left"
        defaultValue={product.content ?? ''}
        onBlur={(e) => {
          const n = e.currentTarget.valueAsNumber
          if (Number.isFinite(n)) {
            handleUpdate(product.id, { content: n })
          }
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          id="purity"
          label="Purity"
          placeholder="Enter purity..."
          inputMode="decimal"
          type="number"
          inputClassName="text-left"
          defaultValue={product.purity ?? ''}
          onBlur={(e) => {
            const n = e.currentTarget.valueAsNumber
            if (Number.isFinite(n)) {
              handleUpdate(product.id, { purity: n })
            }
          }}
        />
        <Input
          id="gross"
          label="Gross"
          placeholder="Enter gross..."
          inputMode="decimal"
          type="number"
          inputClassName="text-left"
          defaultValue={product.gross ?? ''}
          onBlur={(e) => {
            const n = e.currentTarget.valueAsNumber
            if (Number.isFinite(n)) {
              handleUpdate(product.id, { gross: n })
            }
          }}
        />
      </div>
    </div>
  )
}

function Displays({ product }: { product: AdminProduct }) {
  const saveProduct = useSaveProduct()
  const handleUpdate = (patch: Partial<AdminProduct>) => {
    saveProduct.mutate({ ...product, ...patch })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Displays</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch justify-items-stretch">
        <SegmentedField
          label="Buy"
          value={!!product.display}
          onChange={(v) => handleUpdate({ display: v })}
        />
        <SegmentedField
          label="Featured"
          value={!!product.homepage_display}
          onChange={(v) => handleUpdate({ homepage_display: v })}
        />
      </div>
    </div>
  )
}

function Dev({ product }: { product: AdminProduct }) {
  const saveProduct = useSaveProduct()

  const handleUpdate = (patch: Partial<AdminProduct>) => {
    saveProduct.mutate({ ...product, ...patch })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Dev</p>

      <SegmentedField
        label="Shadow Offset"
        value={product.shadow_offset ?? 0}
        onChange={(n) => handleUpdate({ shadow_offset: n })}
        options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
        rowClassName="grid grid-cols-5 gap-2"
      />

      <Input
        id="variant_group"
        label="Variant Group"
        placeholder="Enter variant group..."
        type="text"
        defaultValue={product.variant_group ?? ''}
        onBlur={(e) => handleUpdate({ variant_group: e.target.value })}
      />

      <Input
        id="variant_label"
        label="Variant Label"
        placeholder="Enter variant label..."
        type="text"
        defaultValue={product.variant_label ?? ''}
        onBlur={(e) => handleUpdate({ variant_label: e.target.value })}
      />

      <Input
        id="filter_category"
        label="Filter Category"
        placeholder="Enter category..."
        type="text"
        defaultValue={product.filter_category ?? ''}
        onBlur={(e) => handleUpdate({ filter_category: e.target.value })}
      />

      <Input
        id="slug"
        label="Slug"
        placeholder="Enter slug..."
        type="text"
        defaultValue={product.slug ?? ''}
        onBlur={(e) => handleUpdate({ slug: e.target.value })}
      />
    </div>
  )
}

function Images({ product }: { product: AdminProduct }) {
  const saveProduct = useSaveProduct()

  const handleUpdate = (patch: Partial<AdminProduct>) => {
    saveProduct.mutate({ ...product, ...patch })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Images</p>

      <Input
        id="image_front"
        label="Image Front"
        type="text"
        defaultValue={product.image_front ?? ''}
        onBlur={(e) => handleUpdate({ image_front: e.target.value })}
      />
      <Input
        id="image_back"
        label="Image Back"
        type="text"
        defaultValue={product.image_back ?? ''}
        onBlur={(e) => handleUpdate({ image_back: e.target.value })}
      />
    </div>
  )
}
