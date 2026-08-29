import { Separator } from '@/shared/ui/base/separator'
import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { useSetOrderSpots } from '@/features/orders/spots'
import {
  useCreateOrderItem,
  useDeleteOrderItem,
  usePatchOrderItem,
} from '@/features/orders/items'
import { usePatchShipment, useOrderShipments, outboundOf } from '@/features/shipping/queries'
import { usePatchPayout, useOrderPayouts } from '@/features/payouts/queries'
import { useOrderItems, nameOf, byId } from '@/features/orders/reads'
import type { OrderItem } from '@dorado/contracts'
import type { NamedScrapItem } from '@/features/orders/purchaseOrders/types'

import { cn } from '@/shared/utils/cn'
import { payoutOptions } from '@/features/payouts/types'
import { CaretDownIcon } from '@phosphor-icons/react'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerContentProps,
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
import SelectMenu from '@/shared/ui/SelectMenu'
import { Field } from '@/shared/ui/Field'
import { Product } from '@/features/products/types'
import { useSpotPrices } from '@/features/spots/queries'
import { useProducts } from '@/features/products/queries'
import { useOrderSpots, nameSpots, type NamedOrderSpot } from '@/features/orders/spots'

const METAL_ITEMS = ['Gold', 'Silver', 'Platinum', 'Palladium'].map((metal) => ({
  label: metal,
  value: metal,
}))

export default function AdminReceivedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotRows = [] } = useOrderSpots(order.id)
  // Display composition, client-side: the rows carry metal_id; the reference
  // read supplies the names this screen shows and mutates by.
  const orderSpotPrices = nameSpots(orderSpotRows, spotPrices)

  const setSpots = useSetOrderSpots()
  const patchShipment = usePatchShipment()
  const patchPayout = usePatchPayout()
  const [payoutOpen, setPayoutOpen] = useState(false)

  // A CONTAINER (ruling 14). bullion_id is the discriminator - null means
  // scrap - and the parcel and payout are their own reads.
  const { data: items = [] } = useOrderItems(order.id)
  const { data: catalogue = [] } = useProducts()
  const { data: shipments = [] } = useOrderShipments(order.id)
  const { data: payouts = [] } = useOrderPayouts(order.id)
  const shipment = outboundOf(shipments)
  const payout = payouts[0] ?? null

  const scrapItems = assignScrapItemNames(
    items.filter((item) => item.bullion_id === null),
    (metal_id) => nameOf(spotPrices, metal_id)
  )
  const bullionItems = items.filter((item) => item.bullion_id !== null)

  const handleUpdateSpot = (spot: NamedOrderSpot, updated_spot: number) => {
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
              <small className="tracking-widest">Order Spots</small>
              <Button
                variant="link"
                className="p-0 h-4"
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
                  <small className="flex items-center justify-between w-full">
                    {spot.name}
                  </small>

                  <div className="flex items-center gap-1 w-full">
                    <Input
                      type="number"
                      pattern="[0-9]*"
                      inputMode="decimal"
                      readOnly={!order.spots_locked}
                      className={cn(
                        'no-spinner text-center w-full h-8',
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
                <small className="tracking-widest">Scrap</small>
              </div>

              <ScrapTable scrapItems={scrapItems} config={config} order_id={order.id} />
            </div>
          )}
          <Separator />

          {bullionItems && (
            <div className="flex flex-col w-full gap-3">
              <div className="flex w-full justify-start items-center mb-2">
                <small className="tracking-widest">Bullion</small>
              </div>
              <BullionTable bullionItems={bullionItems} catalogue={catalogue} config={config} order_id={order.id} />
            </div>
          )}
          <Separator />

          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex-col items-start">
              <small>Shipping Charge</small>
              <Input
                type="number"
                pattern="[0-9]*"
                inputMode="decimal"
                className={cn(
                  'no-spinner text-right w-full h-8'
                )}
                defaultValue={shipment?.cost ?? 0}
                onBlur={(e) => {
                  if (!shipment?.id) return
                  patchShipment.mutate({
                    shipment_id: shipment.id,
                    order_id: order.id,
                    patch: { shipping_charge: Number(e.target.value) },
                  })
                }}
              />
            </div>
            <div className="flex-col items-start">
              <small>Payout Charge</small>
              <Input
                type="number"
                pattern="[0-9]*"
                inputMode="decimal"
                className={cn(
                  'no-spinner text-right w-full h-8'
                )}
                defaultValue={payout?.cost ?? 0}
                onBlur={(e) => {
                  if (!payout?.id) return
                  patchPayout.mutate({
                    payout_id: payout.id,
                    order_id: order.id,
                    patch: { cost: Number(e.target.value) },
                  })
                }}
              />
            </div>
          </div>

          {/* WAIVING THE PAYOUT FEE (Jacob, 2026-08-29: "Would actually be
              somewhat nice to have a checkbox for waiving fee or something").
              It sits beside the charge it waives and stays an ordinary
              Checkbox + label, the surrounding pattern in this file.

              IT DOES NOT CLEAR THE CHARGE ABOVE, and that is the point: the
              stored fee is a RECORD (D117), so waiving leaves it reading
              whatever it would have been and only stops the server deducting
              it. Un-waiving therefore restores the same number rather than
              guessing one out of the payout-method table - which four
              production rows already disagree with, in both directions.

              The state is read from the ORDER's money, not from the payout:
              the flag's column is orders.transactions.waive_payout_fee, which
              the order wire serves as `totals`. The write is keyed by the
              payout, like the two controls above it. */}
          <label className="flex items-center gap-2 w-full cursor-pointer">
            <Checkbox
              checked={order.totals?.waive_payout_fee === true}
              disabled={!payout?.id}
              onCheckedChange={(checked) => {
                if (!payout?.id) return
                patchPayout.mutate({
                  payout_id: payout.id,
                  order_id: order.id,
                  patch: { waive_payout_fee: checked === true },
                })
              }}
            />
            <small>Waive Payout Fee</small>
          </label>
          <Separator />

          {/* 'Accepted' left the lifecycle, and the change-payout affordance
              that keyed on it shows here at Received instead (Jacob's lean) -
              beside the payout charge it prices. */}
          {/* One of FIVE hand-rolled Popover+Command menus in this file, every
              one of them `text-primary` over `hover:bg-primary` - two
              near-white tokens, so the label vanished under the cursor (D95).
              `shared/ui/SelectMenu` was written for exactly this and had zero
              importers. */}
          <Field label="Change Payout Method" className="w-full items-start">
            <SelectMenu
              open={payoutOpen}
              onOpenChange={setPayoutOpen}
              value={payout?.method}
              items={payoutOptions.map(({ label, method, icon }) => ({
                label,
                value: method,
                icon,
              }))}
              onSelect={(method) => {
                if (!payout?.id) return
                patchPayout.mutate({
                  payout_id: payout.id,
                  order_id: order.id,
                  patch: { method },
                })
              }}
              trigger={
                <Button
                  variant="secondary"
                  className="flex items-center justify-between gap-1 h-9 w-full"
                >
                  {payoutOptions.find((m) => m.method === payout?.method)?.label}
                  <CaretDownIcon size={20} />
                </Button>
              }
            />
          </Field>
          <Separator />
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
  scrapItems: NamedScrapItem[]
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
    item: NamedScrapItem,
    changes: { premium?: number | null; scrap?: Record<string, unknown> }
  ) => {
    patchItem.mutate({
      order_item_id: item.id,
      order_id,
      patch: {
        scrap: {
          premium: changes.premium !== undefined ? changes.premium : item.premium,
          // THE FULL SCRAP OBJECT, and the row IS it now: 085 folded
          // exchange.scrap into orders.items, so the line's own weights and
          // purity are what the API's full-write op expects.
          scrap: {
            metal: item.metal,
            pre_melt: item.pre_melt,
            post_melt: item.post_melt,
            purity: item.purity,
            content: item.content,
            gross_unit: item.unit,
            ...(changes.scrap ?? {}),
          },
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

  const handleResetItem = (item: { id: string }) => {
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
          <Table className="overflow-hidden">
            <TableHeader>
              <TableRow>
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
                  disabled={editMode && !selectedIds.includes(item.id)}
                  interactive={editMode && selectedIds.includes(item.id)}
                  intent={item.confirmed === true ? 'success' : 'neutral'}
                >
                  <TableCell className="text-left">
                    {item.confirmed ? (
                      <Button
                        variant="tertiary"
                        className="h-4 w-2 p-0 pl-2 m-0 flex justify-center"
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
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-left">{item.name}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="relative flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'no-spinner text-left h-6'
                          )}
                          defaultValue={item.pre_melt ?? ''}
                          onBlur={(e) => {
                            const pre_melt = parseFloat(e.target.value)
                            if (!isNaN(pre_melt)) {
                              handleUpdateItem(item, { scrap: { pre_melt } })
                            }
                          }}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent">
                          {item.unit}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.pre_melt}</div>
                        <div>{item.unit}</div>
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
                            'no-spinner text-left h-6'
                          )}
                          defaultValue={item.post_melt ?? ''}
                          onBlur={(e) => {
                            const post_melt = parseFloat(e.target.value)
                            if (!isNaN(post_melt)) {
                              handleUpdateItem(item, { scrap: { post_melt } })
                            }
                          }}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent">
                          {item.unit}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.post_melt}</div>
                        <div>{item.post_melt && item.unit}</div>
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
                            'no-spinner text-center h-6'
                          )}
                          defaultValue={item.purity ?? ''}
                          onBlur={(e) => {
                            const purity = parseFloat(e.target.value)
                            if (!isNaN(purity)) {
                              handleUpdateItem(item, { scrap: { purity } })
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <>{((item.purity ?? 0) * 100).toFixed(1)}%</>
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
                            'no-spinner text-center h-6'
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
                  variant="secondary"
                  className="w-16 h-8"
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
                  variant="secondary"
                  className="w-16 h-8"
                >
                  Done
                </Button>
              )}

              <Button
                onClick={() => handleDeleteItems(selectedIds)}
                disabled={selectedIds.length === 0}
                variant="secondary"
                intent="danger"
                className="w-16 h-8"
              >
                Remove
              </Button>
            </div>
            <SelectMenu
              open={open}
              onOpenChange={setOpen}
              items={METAL_ITEMS}
              onSelect={handleAddNew}
              contentClassName="w-20"
              trigger={
                <Button
                  disabled={editMode}
                  variant="link"
                  className="flex items-center gap-1 p-0 h-4"
                >
                  <Plus size={16} />
                  Add New
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-center items-center">
          <SelectMenu
            open={open}
            onOpenChange={setOpen}
            items={METAL_ITEMS}
            onSelect={handleAddNew}
            align="center"
            contentClassName="max-w-42"
            trigger={
              <Button disabled={editMode} size="lg">
                Add Scrap to Order
              </Button>
            }
          />
        </div>
      )}
    </>
  )
}

function BullionTable({
  bullionItems,
  catalogue,
  config,
  order_id,
}: {
  bullionItems: OrderItem[]
  // Reference data, resolved by the container and passed down - the row
  // carries bullion_id and nothing else about the product.
  catalogue: Product[]
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
    item: OrderItem,
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

  const handleResetItem = (item: { id: string }) => {
    patchItem.mutate({ order_item_id: item.id, order_id, patch: { reset: true } })
  }

  // A bullion line is created from the catalogue row itself - its id is what
  // tells the server not to mint a scrap row. The menu is keyed by id, so the
  // catalogue row is looked back up here rather than being carried through a
  // shared component that has no business knowing what a product is.
  const productItems = products.map((product) => ({
    label: product.name,
    value: product.id,
  }))

  const handleAddNewById = (id: string) => {
    const item = products.find((product) => product.id === id)
    if (item) createItem.mutate({ order_id, item })
  }

  return (
    <>
      {bullionItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Table className="overflow-hidden">
            <TableHeader>
              <TableRow>
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
                  disabled={editMode && !selectedIds.includes(item.id)}
                  interactive={editMode && selectedIds.includes(item.id)}
                  intent={item.confirmed === true ? 'success' : 'neutral'}
                >
                  <TableCell className="text-left">
                    {item.confirmed ? (
                      <Button
                        variant="tertiary"
                        className="h-4 w-2 p-0 pl-2 m-0 flex justify-center"
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
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-left">{nameOf(catalogue, item.bullion_id)}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className=" flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'no-spinner text-center h-6'
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
                            'no-spinner text-right h-6'
                          )}
                          defaultValue={item.premium ?? byId(catalogue, item.bullion_id)?.bid_premium ?? ''}
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
                        {((item.premium ?? byId(catalogue, item.bullion_id)?.bid_premium ?? 0) * 100).toFixed(1)}%
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
                  variant="secondary"
                  className="w-16 h-8"
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
                  variant="secondary"
                  className="w-16 h-8"
                >
                  Done
                </Button>
              )}

              <Button
                onClick={() => handleDeleteItems(selectedIds)}
                disabled={selectedIds.length === 0}
                variant="secondary"
                intent="danger"
                className="w-16 h-8"
              >
                Remove
              </Button>
            </div>
            <SelectMenu
              open={open}
              onOpenChange={setOpen}
              items={productItems}
              onSelect={handleAddNewById}
              searchPlaceholder="Search products..."
              listClassName="h-50"
              trigger={
                <Button
                  disabled={editMode}
                  variant="link"
                  className="flex items-center gap-1 p-0 h-4"
                >
                  <Plus size={16} />
                  Add New
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center">
          <SelectMenu
            open={open}
            onOpenChange={setOpen}
            items={productItems}
            onSelect={handleAddNewById}
            searchPlaceholder="Search products..."
            align="center"
            contentClassName="max-w-70"
            listClassName="h-50"
            trigger={
              <Button disabled={editMode} size="lg">
                Add Bullion to Order
              </Button>
            }
          />
        </div>
      )}
    </>
  )
}
