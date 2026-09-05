'use client'

import { useDrawerRecord } from '../../hooks/useDrawerRecord'
import { useEffect, useState } from 'react'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import PremiumControl from './PremiumControl'
import {
  useAdminTypes,
  useSaveProduct,
  useAdminMetals,
  useAdminMints,
  useAdminSuppliers,
} from '@/shared/hooks/products/queries'
import { AdminProduct } from '@/shared/types/products'
import {
  Autocomplete,
  Badge,
  Divider,
  Drawer,
  Field,
  Input,
  RadioGroup,
  RadioOption,
  Switch,
  Textarea,
} from '@dorado/components'

export default function ProductDrawer({
  products,
  product_id,
}: {
  products: AdminProduct[]
  product_id: string
}) {
  const { open, record: product, close } = useDrawerRecord('product', products, product_id)
  const saveProduct = useSaveProduct()

  if (!product) {
    return null
  }

  const handleUpdate = (patch: Partial<AdminProduct>) => {
    saveProduct.mutate({ ...product, ...patch })
  }

  return (
    <Drawer label="Product" open={open} setOpen={close}>
      <Header product={product} />
      <Divider />
      <Details product={product} onUpdate={handleUpdate} />
      <Divider />
      <Inventory product={product} onUpdate={handleUpdate} />
      <Divider />
      <Specifications product={product} onUpdate={handleUpdate} />
      <Divider />
      <Displays product={product} onUpdate={handleUpdate} />
      <Divider />
      <Dev product={product} onUpdate={handleUpdate} />
      <Divider />
      <Images product={product} onUpdate={handleUpdate} />
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
    </div>
  )
}

function Details({
  product,
  onUpdate,
}: {
  product: AdminProduct
  onUpdate: (patch: Partial<AdminProduct>) => void
}) {
  const { data: metals = [] } = useAdminMetals()
  const { data: suppliers = [] } = useAdminSuppliers()
  const { data: mints = [] } = useAdminMints()
  const { data: types = [] } = useAdminTypes()

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>
      <Input
        id="name"
        label="Product Name"
        placeholder="Enter name..."
        type="text"
        defaultValue={product.name ?? ''}
        onBlur={(e) => onUpdate({ name: e.target.value })}
      />
      <div className="flex w-full justify-between items-center gap-4">
        <PickerField
          label="Metal"
          value={product.metal_id}
          options={metals?.map((m) => m.id) ?? []}
          onChange={(val) => onUpdate({ metal_id: val })}
        />
        <PickerField
          label="Product Type"
          value={product.type}
          options={types ?? []}
          onChange={(val) => onUpdate({ type: val })}
        />
      </div>
      <PickerField
        label="Supplier"
        value={product.supplier}
        options={suppliers?.map((item) => item.organization.name ?? '') ?? []}
        onChange={(val) => onUpdate({ supplier: val })}
      />
      <PickerField
        label="Mint"
        value={product.mint}
        options={mints?.map((item) => item.name) ?? []}
        onChange={(val) => onUpdate({ mint: val })}
      />

      <Textarea
        rows={20}
        id="description"
        label="Description"
        placeholder="Enter product description..."
        className="min-w-70"
        defaultValue={product.description}
        onBlur={(e) => onUpdate({ description: e.target.value })}
      />
    </div>
  )
}

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

function Inventory({
  product,
  onUpdate,
}: {
  product: AdminProduct
  onUpdate: (patch: Partial<AdminProduct>) => void
}) {
  const { data: spots = [] } = useSpotPrices()
  const spot = spots.find((s) => s.id === product.metal_id)
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Inventory</p>

      <PremiumControl
        label="Bid Premium"
        value={product.bid_premium}
        spotPerOz={spot?.bid ?? 0}
        contentOz={product.content ?? 1}
        onChange={(mult) => onUpdate({ bid_premium: mult })}
      />

      <PremiumControl
        label="Ask Premium"
        value={product.ask_premium}
        spotPerOz={spot?.ask ?? 0}
        contentOz={product.content ?? 1}
        onChange={(mult) => onUpdate({ ask_premium: mult })}
      />
    </div>
  )
}

function Specifications({
  product,
  onUpdate,
}: {
  product: AdminProduct
  onUpdate: (patch: Partial<AdminProduct>) => void
}) {
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
            onUpdate({ content: n })
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
              onUpdate({ purity: n })
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
              onUpdate({ gross: n })
            }
          }}
        />
      </div>
    </div>
  )
}

function Displays({
  product,
  onUpdate,
}: {
  product: AdminProduct
  onUpdate: (patch: Partial<AdminProduct>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Displays</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch justify-items-stretch">
        <Switch
          label="Buy"
          checked={!!product.display}
          onCheckedChange={(v) => onUpdate({ display: v })}
        />
        <Switch
          label="Featured"
          checked={!!product.homepage_display}
          onCheckedChange={(v) => onUpdate({ homepage_display: v })}
        />
      </div>
    </div>
  )
}

function Dev({
  product,
  onUpdate,
}: {
  product: AdminProduct
  onUpdate: (patch: Partial<AdminProduct>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Dev</p>

      <Field label="Shadow Offset">
        <RadioGroup
          value={String(product.shadow_offset ?? 0)}
          onValueChange={(v) => onUpdate({ shadow_offset: Number(v) })}
          className="grid grid-cols-5 gap-2"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <RadioOption key={n} value={String(n)} variant="segment">
              {n}
            </RadioOption>
          ))}
        </RadioGroup>
      </Field>

      <Input
        id="variant_group"
        label="Variant Group"
        placeholder="Enter variant group..."
        type="text"
        defaultValue={product.variant_group ?? ''}
        onBlur={(e) => onUpdate({ variant_group: e.target.value })}
      />

      <Input
        id="variant_label"
        label="Variant Label"
        placeholder="Enter variant label..."
        type="text"
        defaultValue={product.variant_label ?? ''}
        onBlur={(e) => onUpdate({ variant_label: e.target.value })}
      />

      <Input
        id="filter_category"
        label="Filter Category"
        placeholder="Enter category..."
        type="text"
        defaultValue={product.filter_category ?? ''}
        onBlur={(e) => onUpdate({ filter_category: e.target.value })}
      />

      <Input
        id="slug"
        label="Slug"
        placeholder="Enter slug..."
        type="text"
        defaultValue={product.slug ?? ''}
        onBlur={(e) => onUpdate({ slug: e.target.value })}
      />
    </div>
  )
}

function Images({
  product,
  onUpdate,
}: {
  product: AdminProduct
  onUpdate: (patch: Partial<AdminProduct>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Images</p>

      <Input
        id="image_front"
        label="Image Front"
        type="text"
        defaultValue={product.image_front ?? ''}
        onBlur={(e) => onUpdate({ image_front: e.target.value })}
      />
      <Input
        id="image_back"
        label="Image Back"
        type="text"
        defaultValue={product.image_back ?? ''}
        onBlur={(e) => onUpdate({ image_back: e.target.value })}
      />
    </div>
  )
}
