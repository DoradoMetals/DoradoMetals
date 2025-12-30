'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo } from 'react'
import { formatFullDate } from '@/shared/utils/formatDates'
import { cn } from '@/shared/utils/cn'
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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="bg-background">
      <Header product={product} />
      <div className="separator-inset" />
      <Details product={product} />
      <div className="separator-inset" />
      <Inventory product={product} />
      <div className="separator-inset" />
      <Specifications product={product} />
      <div className="separator-inset" />
      <Displays product={product} />
      <div className="separator-inset" />
      <Dev product={product} />
      <div className="separator-inset" />
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
          <div className="text-xl text-neutral-900">{product.product_name}</div>
        </div>
        <div
          className={cn(
            'px-2 py-1 border-1 rounded-lg flex justify-center items-center font-semibold text-base',
            activeProduct
              ? 'bg-success/20 text-success border-success'
              : 'bg-destructive/20 text-destructive border-destructive'
          )}
        >
          {activeProduct ? 'Active' : 'Inactive'}
        </div>
      </div>
      <div className="flex w-full justify-start text-xs gap-1">
        <span className="text-neutral-600">Updated by</span>
        <span className="text-neutral-800">{product.updated_by}</span>
        <span className="text-neutral-600">on</span>
        <span className="text-neutral-800">{formatFullDate(product.updated_at)}</span>
      </div>
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
      <div className="section-label mb-4">Details</div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="product_name" className="text-xs pl-1 font-medium text-neutral-700">
          Product Name
        </Label>

        <Input
          id="product_name"
          placeholder="Enter name..."
          type="text"
          className="bg-highest border-border"
          defaultValue={product.product_name ?? ''}
          onBlur={(e) => handleUpdate(product.id, { product_name: e.target.value })}
        />
      </div>
      <div className="flex w-full justify-between items-center gap-4">
        <PopoverSelect
          label="Metal"
          value={product.metal}
          options={metals?.map((m) => m.type)}
          onChange={(val) => handleUpdate(product.id, { metal: val })}
          triggerClass="raised-off-page bg-highest"
        />
        <PopoverSelect
          label="Product Type"
          value={product.product_type}
          options={types?.map((item) => item.name)}
          onChange={(val) => handleUpdate(product.id, { product_type: val })}
          triggerClass="raised-off-page bg-highest"
        />
      </div>
      <PopoverSelect
        label="Supplier"
        value={product.supplier}
        options={suppliers?.map((item) => item.name)}
        onChange={(val) => handleUpdate(product.id, { supplier: val })}
        triggerClass="raised-off-page bg-highest"
      />
      <PopoverSelect
        label="Mint"
        value={product.mint}
        options={mints?.map((item) => item.name)}
        onChange={(val) => handleUpdate(product.id, { mint: val })}
        triggerClass="raised-off-page bg-highest"
      />

      <div className="flex flex-col w-full gap-1">
        <Label htmlFor="description" className="text-xs pl-1 font-medium text-neutral-700">
          Description
        </Label>
        <Textarea
          rows={20}
          id="description"
          placeholder="Enter product description..."
          className="bg-highest border-border min-w-70"
          defaultValue={product.product_description}
          onBlur={(e) => handleUpdate(product.id, { product_description: e.target.value })}
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
  const spot = spots.find((s) => s.type === product.metal)
  return (
    <div className="flex flex-col gap-4">
      <div className="section-label">Inventory</div>

      <PremiumControl
        label="Bid Premium"
        value={product.bid_premium}
        spotPerOz={spot?.bid_spot ?? 0}
        contentOz={product.content ?? 1}
        onChange={(mult) => handleUpdate(product.id, { bid_premium: mult })}
      />

      <PremiumControl
        label="Ask Premium"
        value={product.ask_premium}
        spotPerOz={spot?.ask_spot ?? 0}
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
      <div className="section-label">Specifications</div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="content" className="text-xs pl-1 font-medium text-neutral-700">
          Content
        </Label>

        <Input
          id="content"
          inputMode="decimal"
          placeholder="Enter content..."
          type="number"
          className="bg-highest border-border text-left no-spinner"
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
          <Label htmlFor="purity" className="text-xs pl-1 font-medium text-neutral-700">
            Purity
          </Label>

          <Input
            id="purity"
            placeholder="Enter purity..."
            inputMode="decimal"
            type="number"
            className="bg-highest border-border text-left no-spinner"
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
          <Label htmlFor="gross" className="text-xs pl-1 font-medium text-neutral-700">
            Gross
          </Label>

          <Input
            id="gross"
            placeholder="Enter gross..."
            inputMode="decimal"
            type="number"
            className="bg-highest border-border text-left no-spinner"
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
      <div className="section-label">Displays</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 items-stretch justify-items-stretch">
        <DisplayToggle
          label="Buy"
          value={!!product.display}
          onChange={(v) => handleUpdate({ display: v })}
          className="w-full"
        />
        <DisplayToggle
          label="Sell"
          value={!!product.sell_display}
          onChange={(v) => handleUpdate({ sell_display: v })}
          className="w-full"
        />
        <DisplayToggle
          label="Featured"
          value={!!product.homepage_display}
          onChange={(v) => handleUpdate({ homepage_display: v })}
          className="w-full"
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
      <div className="section-label">Dev</div>

      <DotSelect
        label="Shadow Offset"
        count={10}
        value={product.shadow_offset ?? 0}
        onChange={(n) => handleUpdate({ shadow_offset: n })}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor="variant_group" className="text-xs pl-1 font-medium text-neutral-700">
          Variant Group
        </Label>

        <Input
          id="variant_group"
          placeholder="Enter variant group..."
          type="text"
          className="bg-highest border-border"
          defaultValue={product.variant_group ?? ''}
          onBlur={(e) => handleUpdate({ variant_group: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="variant_label" className="text-xs pl-1 font-medium text-neutral-700">
          Variant Label
        </Label>

        <Input
          id="variant_label"
          placeholder="Enter variant label..."
          type="text"
          className="bg-highest border-border"
          defaultValue={product.variant_label ?? ''}
          onBlur={(e) => handleUpdate({ variant_label: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="filter_category" className="text-xs pl-1 font-medium text-neutral-700">
          Filter Category
        </Label>

        <Input
          id="filter_category"
          placeholder="Enter category..."
          type="text"
          className="bg-highest border-border"
          defaultValue={product.filter_category ?? ''}
          onBlur={(e) => handleUpdate({ filter_category: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="slug" className="text-xs pl-1 font-medium text-neutral-700">
          Slug
        </Label>

        <Input
          id="slug"
          placeholder="Enter slug..."
          type="text"
          className="bg-highest border-border"
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
      <div className="section-label">Images</div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="image_front" className="text-xs pl-1 font-medium text-neutral-700">
          Image Front
        </Label>

        <Input
          id="image_front"
          type="text"
          className="bg-highest border-border"
          defaultValue={product.image_front ?? ''}
          onBlur={(e) => handleUpdate({ image_front: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="image_back" className="text-xs pl-1 font-medium text-neutral-700">
          Image Back
        </Label>

        <Input
          id="image_back"
          type="text"
          className="bg-highest border-border"
          defaultValue={product.image_back ?? ''}
          onBlur={(e) => handleUpdate({ image_back: e.target.value })}
        />
      </div>
    </div>
  )
}
