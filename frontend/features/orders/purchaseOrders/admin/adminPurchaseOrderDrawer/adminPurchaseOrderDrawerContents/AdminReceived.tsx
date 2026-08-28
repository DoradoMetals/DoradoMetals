import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { useSetOrderSpots } from '@/features/orders/spots'
import {
  useCreateOrderItem,
  useDeleteOrderItem,
  usePatchOrderItem,
} from '@/features/orders/items'
import { usePatchShipment } from '@/features/shipping/queries'
import { usePatchPayout } from '@/features/payouts/queries'

import { cn } from '@/shared/utils/cn'
import { payoutOptions } from '@/features/payouts/types'
import { CaretDownIcon } from '@phosphor-icons/react'
import type { SpotOnOrder } from '@dorado/contracts'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerContentProps,
  PurchaseOrderItem,
  statusConfig,
  StatusConfigEntry,
} from '@/features/orders/purchaseOrders/types'
import { Lock, Plus, RotateCcw, Unlock } from 'lucide-react'
import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import { Checkbox } from '@/shared/ui/base/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Command, CommandInput, CommandItem, CommandList } from '@/shared/ui/base/command'
import { Product } from '@/features/products/types'
import { useSpotPrices } from '@/features/spots/queries'
import { useProducts } from '@/features/products/queries'
import { usePurchaseOrderMetals } from '@/features/orders/purchaseOrders/users/queries'

export default function AdminReceivedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const setSpots = useSetOrderSpots()
  const patchShipment = usePatchShipment()
  const patchPayout = usePatchPayout()
  const [payoutOpen, setPayoutOpen] = useState(false)

  const rawScrapItems = order.order_items.filter((item) => item.item_type === 'scrap' && item.scrap)
  const scrapItems = assignScrapItemNames(rawScrapItems)
  const bullionItems = order.order_items.filter((item) => item.item_type === 'product')

  const handleUpdateSpot = (spot: SpotOnOrder, updated_spot: number) => {
    if (!spot.name) return
    setSpots.mutate({ order_id: order.id, set: [{ name: spot.name, bid: updated_spot }] })
  }

  // Locking writes the metal rows - at the live prices the SERVER resolves.
  // The legacy route took the browser's copy of the feed down with the lock;
  // the resource takes only the intent.
  const handleLockSpots = () => {
    setSpots.mutate({ order_id: order.id, lock: true })
  }

  const handleResetSpots = () => {
    setSpots.mutate({ order_id: order.id, lock: false })
  }

  const config = statusConfig[order.status ?? '']

  return (
    <>
      <div className="flex w-full">
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex w-full justify-between items-center mb-2">
              <div className="text-xs tracking-widest text-neutral-600">Order Spots</div>
              <Button
                variant="link"
                className={cn(
                  'text-primary',
                  'p-0 font-normal text-sm h-4 hover:bg-transparent'
                )}
                onClick={() => (order.spots_locked ? handleResetSpots() : handleLockSpots())}
                disabled={setSpots.isPending}
              >
                {order.spots_locked ? (
                  <div className="flex gap-1 items-center">
                    {setSpots.isPending ? 'Unlocking...' : 'Unlock Spots'}
                    <Unlock size={16} />
                  </div>
                ) : (
                  <div className="flex gap-1 items-center">
                    {setSpots.isPending ? 'Locking...' : 'Lock Spots'}
                    <Lock size={16} />
                  </div>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              {orderSpotPrices.map((spot) => (
                <div key={spot.id} className="flex flex-col w-full">
                  <div className="flex items-center justify-between w-full text-sm text-neutral-700">
                    {spot.name}
                  </div>

                  <div className="flex items-center gap-1 w-full">
                    <Input
                      type="number"
                      pattern="[0-9]*"
                      inputMode="decimal"
                      readOnly={!order.spots_locked}
                      className={cn(
                        'on-glass no-spinner text-center w-full text-base h-8',
                        !order?.spots_locked && 'cursor-not-allowed'
                      )}
                      defaultValue={
                        spot?.bid ??
                        spotPrices?.find((s) => s.name === spot.name)?.bid ??
                        ''
                      }
                      onBlur={(e) => handleUpdateSpot(spot, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {scrapItems && (
            <div className="flex flex-col w-full gap-3">
              <div className="flex w-full justify-start items-center mb-2">
                <div className="text-xs tracking-widest text-neutral-600">Scrap</div>
              </div>

              <ScrapTable scrapItems={scrapItems} config={config} order_id={order.id} />
            </div>
          )}
          <div className="glass-divider" />

          {bullionItems && (
            <div className="flex flex-col w-full gap-3">
              <div className="flex w-full justify-start items-center mb-2">
                <div className="text-xs tracking-widest text-neutral-600">Bullion</div>
              </div>
              <BullionTable bullionItems={bullionItems} config={config} order_id={order.id} />
            </div>
          )}
          <div className="glass-divider" />

          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex-col items-start">
              <div className="text-sm text-neutral-600">Shipping Charge</div>
              <Input
                type="number"
                pattern="[0-9]*"
                inputMode="decimal"
                className={cn(
                  'on-glass no-spinner text-right w-full text-base h-8'
                )}
                defaultValue={order.shipment.shipping_charge ?? 0}
                onBlur={(e) => {
                  if (!order.shipment.id) return
                  patchShipment.mutate({
                    shipment_id: order.shipment.id,
                    order_id: order.id,
                    patch: { shipping_charge: Number(e.target.value) },
                  })
                }}
              />
            </div>
            <div className="flex-col items-start">
              <div className="text-sm text-neutral-600">Payout Charge</div>
              <Input
                type="number"
                pattern="[0-9]*"
                inputMode="decimal"
                className={cn(
                  'on-glass no-spinner text-right w-full text-base h-8'
                )}
                defaultValue={order.payout.cost ?? 0}
                onBlur={(e) => {
                  if (!order.payout.id) return
                  patchPayout.mutate({
                    payout_id: order.payout.id,
                    order_id: order.id,
                    patch: { cost: Number(e.target.value) },
                  })
                }}
              />
            </div>
          </div>
          <div className="glass-divider" />

          {/* 'Accepted' left the lifecycle, and the change-payout affordance
              that keyed on it shows here at Received instead (Jacob's lean) -
              beside the payout charge it prices. */}
          <div className="flex flex-col gap-1 items-start w-full">
            <div className="text-sm text-neutral-600 tracking-wide">Change Payout Method</div>
            <Popover open={payoutOpen} onOpenChange={setPayoutOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'text-primary',
                    'flex items-center justify-between gap-1 px-4 font-normal text-sm on-glass border-none h-9 w-full'
                  )}
                >
                  {payoutOptions.find((m) => m.method === order.payout.method)?.label}
                  <CaretDownIcon size={20} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-48 z-70"
                align="end"
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command className="bg-card">
                  <CommandList>
                    {payoutOptions.map(({ label, method, icon: Icon }) => (
                      <CommandItem
                        key={label}
                        onSelect={() => {
                          if (order.payout.id) {
                            patchPayout.mutate({
                              payout_id: order.payout.id,
                              order_id: order.id,
                              patch: { method },
                            })
                          }
                          setPayoutOpen(false)
                        }}
                        className={cn(
                          'group h-9 px-3 flex items-center gap-2 transition-colors duration-150 cursor-pointer',
                          'text-primary',
                          'hover:bg-primary'
                        )}
                      >
                        <Icon size={16} className={cn('text-primary')} />
                        <span className="transition-colors">{label}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="glass-divider" />
        </div>
      </div>
    </>
  )
}

function ScrapTable({
  scrapItems,
  config,
  order_id,
}: {
  scrapItems: PurchaseOrderItem[]
  config: StatusConfigEntry
  order_id: string
}) {
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const patchItem = usePatchOrderItem()
  const deleteItem = useDeleteOrderItem()
  const createItem = useCreateOrderItem()

  // The write carries the FULL scrap object and the line's premium - the
  // API's scrap op sets every column it knows (see OrderItemScrapPatch).
  const handleUpdateItem = (
    item: PurchaseOrderItem,
    changes: { premium?: number | null; scrap?: Record<string, unknown> }
  ) => {
    patchItem.mutate({
      order_item_id: item.id,
      order_id,
      patch: {
        scrap: {
          premium: changes.premium !== undefined ? changes.premium : item.premium,
          scrap: { ...item.scrap!, ...(changes.scrap ?? {}) },
        },
      },
    })
  }

  // Per-resource means one DELETE per line; the selection is small by
  // construction (checked rows in one drawer).
  const handleDeleteItems = (ids: string[]) => {
    for (const id of ids) deleteItem.mutate({ order_item_id: id, order_id })
  }

  const handleSavedItems = (ids: string[]) => {
    for (const id of ids) {
      patchItem.mutate({ order_item_id: id, order_id, patch: { confirmed: true } })
    }
  }

  const handleResetItem = (item: PurchaseOrderItem) => {
    patchItem.mutate({ order_item_id: item.id, order_id, patch: { reset: true } })
  }

  const handleAddNew = (metal: string) => {
    createItem.mutate({
      order_id,
      item: { metal, pre_melt: 1, purity: 1, content: 1, gross_unit: 't oz' },
    })
  }

  return (
    <>
      {scrapItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableHeader className="text-xs text-neutral-700 hover:bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left"></TableHead>
                <TableHead className="text-left">Line Item</TableHead>
                <TableHead className="text-center">Pre Melt</TableHead>
                <TableHead className="text-center">Post Melt</TableHead>
                <TableHead className="text-center">Assay</TableHead>
                <TableHead className="text-right">Premium</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scrapItems.map((item, i) => (
                <TableRow
                  key={i}
                  className={cn(
                    'transition-colors hover:bg-transparent',
                    editMode && !selectedIds.includes(item.id) && 'opacity-50 pointer-events-none',
                    editMode && selectedIds.includes(item.id) && 'hover:bg-muted/30',
                    item.confirmed === true ? 'bg-success/10 hover:bg-success/10' : ''
                  )}
                >
                  <TableCell className="text-left">
                    {item.confirmed ? (
                      <Button
                        variant="ghost"
                        className="h-4 w-2 p-0 pl-2 m-0 text-muted-foreground hover:text-foreground flex justify-center"
                        onClick={() => handleResetItem(item)}
                      >
                        <RotateCcw size={16} className="p-0 m-0" />
                      </Button>
                    ) : (
                      <Checkbox
                        disabled={editMode}
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds((prev) => [...prev, item.id])
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== item.id))
                          }
                        }}
                        className="checkbox-form"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-left">{item.scrap?.name}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="relative flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'on-glass no-spinner text-left text-base h-6'
                          )}
                          defaultValue={item.scrap?.pre_melt ?? ''}
                          onBlur={(e) => {
                            const pre_melt = parseFloat(e.target.value)
                            if (!isNaN(pre_melt)) {
                              handleUpdateItem(item, { scrap: { pre_melt } })
                            }
                          }}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent">
                          {item.scrap?.gross_unit}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.scrap?.pre_melt}</div>
                        <div>{item.scrap?.gross_unit}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="relative flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'on-glass no-spinner text-left text-base h-6'
                          )}
                          defaultValue={item.scrap?.post_melt ?? ''}
                          onBlur={(e) => {
                            const post_melt = parseFloat(e.target.value)
                            if (!isNaN(post_melt)) {
                              handleUpdateItem(item, { scrap: { post_melt } })
                            }
                          }}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent">
                          {item.scrap?.gross_unit}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.scrap?.post_melt}</div>
                        <div>{item.scrap?.post_melt && item.scrap?.gross_unit}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'on-glass no-spinner text-center text-base h-6'
                          )}
                          defaultValue={item.scrap?.purity ?? ''}
                          onBlur={(e) => {
                            const purity = parseFloat(e.target.value)
                            if (!isNaN(purity)) {
                              handleUpdateItem(item, { scrap: { purity } })
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <>{((item.scrap?.purity ?? 0) * 100).toFixed(1)}%</>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'on-glass no-spinner text-center text-base h-6'
                          )}
                          defaultValue={item.premium ?? ''}
                          onBlur={(e) => {
                            const premium = parseFloat(e.target.value)
                            if (!isNaN(premium)) {
                              handleUpdateItem(item, { premium })
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <>{((item.premium ?? 0) * 100).toFixed(1)}%</>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex w-full justify-between items-center">
            <div className="flex items-center gap-2">
              {!editMode ? (
                <Button
                  onClick={() => setEditMode(true)}
                  disabled={selectedIds.length === 0}
                  variant="default"
                  className={cn(
                    'raised-off-page w-16 text-white h-8 hover:text-white',
                    'primary-on-glass',
                    'hover:bg-primary',
                    selectedIds.length === 0 && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  Edit
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setEditMode(false)
                    handleSavedItems(selectedIds)
                    setSelectedIds([])
                  }}
                  disabled={selectedIds.length === 0}
                  variant="default"
                  className={cn(
                    'raised-off-page w-16 text-white h-8 hover:text-white',
                    'primary-on-glass',
                    'hover:bg-primary',
                    editMode || (selectedIds.length === 0 && 'opacity-50 cursor-not-allowed')
                  )}
                >
                  Done
                </Button>
              )}

              <Button
                onClick={() => handleDeleteItems(selectedIds)}
                disabled={selectedIds.length === 0}
                variant="outline"
                className={cn(
                  'raised-off-page w-16 on-glass h-8 hover:text-white hover:border-none',
                  'border-primary',
                  'text-primary',
                  'hover:bg-primary',
                  (editMode || selectedIds.length === 0) && 'opacity-50 cursor-not-allowed'
                )}
              >
                Remove
              </Button>
            </div>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  disabled={editMode}
                  variant="link"
                  className={cn(
                    'text-primary',
                    'flex items-center gap-1 p-0 font-normal text-sm h-4 hover:bg-transparent',
                    editMode && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Plus size={16} />
                  Add New
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-20 h-full z-70"
                align="end"
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command className="bg-card">
                  <CommandList>
                    {['Gold', 'Silver', 'Platinum', 'Palladium'].map((metal) => (
                      <CommandItem
                        key={metal}
                        onSelect={() => {
                          handleAddNew(metal)
                          setOpen(false)
                        }}
                        className={cn(
                          'group h-9 px-3 flex items-center gap-2 transition-colors duration-150 cursor-pointer',
                          'text-primary',
                          'hover:bg-primary'
                        )}
                      >
                        <span
                          className={cn(
                            'transition-colors',
                            'text-primary',
                            'group-hover:text-white'
                          )}
                        >
                          {metal}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ) : (
        <div className="flex justify-center items-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={editMode}
                variant="default"
                className={cn(
                  'primary-on-glass',
                  'hover:bg-primary',
                  'flex items-center gap-1 p-4 font-normal text-base text-white'
                )}
              >
                Add Scrap to Order
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0 max-w-42 h-full z-70"
              align="center"
              side="bottom"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command className="bg-card">
                <CommandList>
                  {['Gold', 'Silver', 'Platinum', 'Palladium'].map((metal) => (
                    <CommandItem
                      key={metal}
                      onSelect={() => {
                        handleAddNew(metal)
                        setOpen(false)
                      }}
                      className={cn(
                        'group h-9 px-3 flex items-center gap-2 transition-colors duration-150 cursor-pointer',
                        'text-primary',
                        'hover:bg-primary'
                      )}
                    >
                      <span
                        className={cn(
                          'transition-colors',
                          'text-primary',
                          'group-hover:text-white'
                        )}
                      >
                        {metal}
                      </span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </>
  )
}

function BullionTable({
  bullionItems,
  config,
  order_id,
}: {
  bullionItems: PurchaseOrderItem[]
  config: StatusConfigEntry
  order_id: string
}) {
  const [open, setOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { data: products = [] } = useProducts()

  const patchItem = usePatchOrderItem()
  const deleteItem = useDeleteOrderItem()
  const createItem = useCreateOrderItem()

  // Both bullion columns ride every write - the API SETs quantity and
  // premium in one statement (see OrderItemBullionPatch).
  const handleUpdateItem = (
    item: PurchaseOrderItem,
    changes: { quantity?: number | null; premium?: number | null }
  ) => {
    patchItem.mutate({
      order_item_id: item.id,
      order_id,
      patch: {
        bullion: {
          quantity: changes.quantity !== undefined ? changes.quantity : item.quantity,
          premium: changes.premium !== undefined ? changes.premium : item.premium,
        },
      },
    })
  }

  const handleDeleteItems = (ids: string[]) => {
    for (const id of ids) deleteItem.mutate({ order_item_id: id, order_id })
  }

  const handleSavedItems = (ids: string[]) => {
    for (const id of ids) {
      patchItem.mutate({ order_item_id: id, order_id, patch: { confirmed: true } })
    }
  }

  const handleResetItem = (item: PurchaseOrderItem) => {
    patchItem.mutate({ order_item_id: item.id, order_id, patch: { reset: true } })
  }

  // A bullion line is created from the catalogue row itself - its id is what
  // tells the server not to mint a scrap row.
  const handleAddNew = (item: Product) => {
    createItem.mutate({ order_id, item })
  }

  return (
    <>
      {bullionItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableHeader className="text-xs text-neutral-700 hover:bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left"></TableHead>
                <TableHead className="text-left">Name</TableHead>
                <TableHead className="text-center">Quantity</TableHead>
                <TableHead className="text-right">Premium</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bullionItems.map((item, i) => (
                <TableRow
                  key={i}
                  className={cn(
                    'transition-colors hover:bg-transparent',
                    editMode && !selectedIds.includes(item.id) && 'opacity-50 pointer-events-none',
                    editMode && selectedIds.includes(item.id) && 'hover:bg-muted/30',
                    item.confirmed === true ? 'bg-success/10 hover:bg-success/10' : ''
                  )}
                >
                  <TableCell className="text-left">
                    {item.confirmed ? (
                      <Button
                        variant="ghost"
                        className="h-4 w-2 p-0 pl-2 m-0 text-muted-foreground hover:text-foreground flex justify-center"
                        onClick={() => handleResetItem(item)}
                      >
                        <RotateCcw size={16} className="p-0 m-0" />
                      </Button>
                    ) : (
                      <Checkbox
                        disabled={editMode}
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds((prev) => [...prev, item.id])
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => id !== item.id))
                          }
                        }}
                        className="checkbox-form"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-left">{item.product?.name}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className=" flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'on-glass no-spinner text-center text-base h-6'
                          )}
                          defaultValue={item.quantity ?? ''}
                          onBlur={(e) => {
                            const quantity = parseFloat(e.target.value)
                            if (!isNaN(quantity)) {
                              handleUpdateItem(item, { quantity })
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.quantity}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'on-glass no-spinner text-right text-base h-6'
                          )}
                          defaultValue={item.premium ?? item.product?.bid_premium ?? ''}
                          onBlur={(e) => {
                            const premium = parseFloat(e.target.value)
                            if (!isNaN(premium)) {
                              handleUpdateItem(item, { premium })
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div>
                        {((item.premium ?? item.product?.bid_premium ?? 0) * 100).toFixed(1)}%
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex w-full justify-between items-center">
            <div className="flex items-center gap-2">
              {!editMode ? (
                <Button
                  onClick={() => setEditMode(true)}
                  disabled={selectedIds.length === 0}
                  variant="default"
                  className={cn(
                    'raised-off-page w-16 text-white h-8 hover:text-white',
                    'primary-on-glass',
                    'hover:bg-primary',
                    selectedIds.length === 0 && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  Edit
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setEditMode(false)
                    handleSavedItems(selectedIds)
                    setSelectedIds([])
                  }}
                  disabled={selectedIds.length === 0}
                  variant="default"
                  className={cn(
                    'raised-off-page w-16 text-white h-8 hover:text-white',
                    'primary-on-glass',
                    'hover:bg-primary',
                    editMode || (selectedIds.length === 0 && 'opacity-50 cursor-not-allowed')
                  )}
                >
                  Done
                </Button>
              )}

              <Button
                onClick={() => handleDeleteItems(selectedIds)}
                disabled={selectedIds.length === 0}
                variant="outline"
                className={cn(
                  'raised-off-page w-16 on-glass h-8 hover:text-white hover:border-none',
                  'border-primary',
                  'text-primary',
                  'hover:bg-primary',
                  (editMode || selectedIds.length === 0) && 'opacity-50 cursor-not-allowed'
                )}
              >
                Remove
              </Button>
            </div>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  disabled={editMode}
                  variant="link"
                  className={cn(
                    'text-primary',
                    'flex items-center gap-1 p-0 font-normal text-sm h-4 hover:bg-transparent',
                    editMode && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Plus size={16} />
                  Add New
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 h-50 z-70"
                align="end"
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command className="bg-card">
                  <CommandInput
                    placeholder="Search products..."
                    className="h-8 text-xs text-neutral-600"
                  />
                  <CommandList>
                    {products.map((product) => (
                      <CommandItem
                        key={product.id}
                        onSelect={() => {
                          handleAddNew(product)
                          setOpen(false)
                        }}
                        className={cn(
                          'group h-9 px-3 flex items-center justify-between gap-2 transition-colors duration-150 cursor-pointer',
                          'text-primary',
                          'hover:bg-primary'
                        )}
                      >
                        <span
                          className={cn(
                            'transition-colors group-hover:text-white',
                            'text-primary'
                          )}
                        >
                          {product.name}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={editMode}
                variant="default"
                className={cn(
                  'primary-on-glass',
                  'hover:bg-primary',
                  'flex items-center gap-1 p-4 font-normal text-base text-white'
                )}
              >
                Add Bullion to Order
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0 max-w-70 h-50 z-70"
              align="center"
              side="bottom"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Command className="bg-card">
                <CommandInput
                  placeholder="Search products..."
                  className="h-8 text-xs text-neutral-600"
                />
                <CommandList>
                  {products.map((product) => (
                    <CommandItem
                      key={product.id}
                      onSelect={() => {
                        handleAddNew(product)
                        setOpen(false)
                      }}
                      className={cn(
                        'group h-9 px-3 flex items-center justify-between gap-2 transition-colors duration-150 cursor-pointer',
                        'text-primary',
                        'hover:bg-primary'
                      )}
                    >
                      <span
                        className={cn(
                          'transition-colors group-hover:text-white',
                          'text-primary'
                        )}
                      >
                        {product.name}
                      </span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </>
  )
}
