'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import { formatFullDate } from '@/shared/utils/formatDates'
import StatusChip from '@/shared/ui/StatusChip'
import UpdatedByline from '@/shared/ui/UpdatedByline'
import { PopoverSelect } from '@/shared/ui/table/PopoverSelect'
import { Textarea } from '@/shared/ui/base/textarea'
import { Label } from '@/shared/ui/base/label'
import { Input } from '@/shared/ui/base/input'
import { useSpotPrices } from '@/features/spots/queries'
import PremiumControl from '@/features/products/ui/PremiumControl'
import QuantityBar from '@/features/products/ui/QuantityInput'
import { DisplayToggle } from '@/shared/ui/DisplayToggle'
import {
  useAdminTypes,
  useSaveProduct,
  useAdminMetals,
  useAdminMints,
  useAdminSuppliers,
} from '@/features/products/queries'
import { AdminProduct } from '@/features/products/types'
import DotSelect from '@/shared/ui/DotSelect'
import { Separator } from '@/shared/ui/base/separator'

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
      <Separator />
      <Details product={product} />
      <Separator />
      <Inventory product={product} />
      <Separator />
      <Specifications product={product} />
      <Separator />
      <Displays product={product} />
      <Separator />
      <Dev product={product} />
      <Separator />
      <Images product={product} />
    </Drawer>
  )
}

function Header({ product }: { product: AdminProduct }) {
  const activeProduct = product.display || product.sell_display

  return (
    <div className="flex flex-col w-full gap-8">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1">
          <img src={product.image_front ?? ''} alt={`product image`} height={50} width={50} />
          <h3>{product.name}</h3>
        </div>
        <StatusChip positive={activeProduct} size="lg">
          {activeProduct ? 'Active' : 'Inactive'}
        </StatusChip>
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
      <div className="flex flex-col gap-1">
        <Label htmlFor="name" className="pl-1">
          Product Name
        </Label>

        <Input
          id="name"
          placeholder="Enter name..."
          type="text"
          defaultValue={product.name ?? ''}
          onBlur={(e) => handleUpdate(product.id, { name: e.target.value })}
        />
      </div>
      <div className="flex w-full justify-between items-center gap-4">
        <PopoverSelect
          label="Metal"
          value={product.metal}
          options={metals?.map((m) => m.name)}
          onChange={(val) => handleUpdate(product.id, { metal: val })}
          variant="secondary"
          includeSearch={false}
        />
        <PopoverSelect
          label="Product Type"
          value={product.type}
          options={types?.map((item) => item.name)}
          onChange={(val) => handleUpdate(product.id, { type: val })}
          variant="secondary"
          includeSearch={false}
        />
      </div>
      <PopoverSelect
        label="Supplier"
        value={product.supplier}
        options={suppliers?.map((item) => item.organization.name ?? '')}
        onChange={(val) => handleUpdate(product.id, { supplier: val })}
        variant="secondary"
      />
      <PopoverSelect
        label="Mint"
        value={product.mint}
        options={mints?.map((item) => item.name)}
        onChange={(val) => handleUpdate(product.id, { mint: val })}
        variant="secondary"
      />

      <div className="flex flex-col w-full gap-1">
        <Label htmlFor="description" className="pl-1">
          Description
        </Label>
        <Textarea
          rows={20}
          id="description"
          placeholder="Enter product description..."
          className="min-w-70"
          defaultValue={product.description}
          onBlur={(e) => handleUpdate(product.id, { description: e.target.value })}
        />
      </div>
    </div>
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

      <div className="flex flex-col gap-1">
        <Label htmlFor="content" className="pl-1">
          Content
        </Label>

        <Input
          id="content"
          inputMode="decimal"
          placeholder="Enter content..."
          type="number"
          className="text-left no-spinner"
          defaultValue={product.content ?? ''}
          onBlur={(e) => {
            const n = e.currentTarget.valueAsNumber
            if (Number.isFinite(n)) {
              handleUpdate(product.id, { content: n })
            }
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="purity" className="pl-1">
            Purity
          </Label>

          <Input
            id="purity"
            placeholder="Enter purity..."
            inputMode="decimal"
            type="number"
            className="text-left no-spinner"
            defaultValue={product.purity ?? ''}
            onBlur={(e) => {
              const n = e.currentTarget.valueAsNumber
              if (Number.isFinite(n)) {
                handleUpdate(product.id, { purity: n })
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="gross" className="pl-1">
            Gross
          </Label>

          <Input
            id="gross"
            placeholder="Enter gross..."
            inputMode="decimal"
            type="number"
            className="text-left no-spinner"
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
        <DisplayToggle
          label="Buy"
          value={!!product.display}
          onChange={(v) => handleUpdate({ display: v })}
          className="w-full"
          onLabel="Yes"
          offLabel="No"
        />
        <DisplayToggle
          label="Sell"
          value={!!product.sell_display}
          onChange={(v) => handleUpdate({ sell_display: v })}
          className="w-full"
          onLabel="Yes"
          offLabel="No"
        />
        <DisplayToggle
          label="Featured"
          value={!!product.homepage_display}
          onChange={(v) => handleUpdate({ homepage_display: v })}
          className="w-full"
          onLabel="Yes"
          offLabel="No"
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

      <DotSelect
        label="Shadow Offset"
        count={10}
        value={product.shadow_offset ?? 0}
        onChange={(n) => handleUpdate({ shadow_offset: n })}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor="variant_group" className="pl-1">
          Variant Group
        </Label>

        <Input
          id="variant_group"
          placeholder="Enter variant group..."
          type="text"
          defaultValue={product.variant_group ?? ''}
          onBlur={(e) => handleUpdate({ variant_group: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="variant_label" className="pl-1">
          Variant Label
        </Label>

        <Input
          id="variant_label"
          placeholder="Enter variant label..."
          type="text"
          defaultValue={product.variant_label ?? ''}
          onBlur={(e) => handleUpdate({ variant_label: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="filter_category" className="pl-1">
          Filter Category
        </Label>

        <Input
          id="filter_category"
          placeholder="Enter category..."
          type="text"
          defaultValue={product.filter_category ?? ''}
          onBlur={(e) => handleUpdate({ filter_category: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="slug" className="pl-1">
          Slug
        </Label>

        <Input
          id="slug"
          placeholder="Enter slug..."
          type="text"
          defaultValue={product.slug ?? ''}
          onBlur={(e) => handleUpdate({ slug: e.target.value })}
        />
      </div>
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

      <div className="flex flex-col gap-1">
        <Label htmlFor="image_front" className="pl-1">
          Image Front
        </Label>

        <Input
          id="image_front"
          type="text"
          defaultValue={product.image_front ?? ''}
          onBlur={(e) => handleUpdate({ image_front: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="image_back" className="pl-1">
          Image Back
        </Label>

        <Input
          id="image_back"
          type="text"
          defaultValue={product.image_back ?? ''}
          onBlur={(e) => handleUpdate({ image_back: e.target.value })}
        />
      </div>
    </div>
  )
}
