import {
  Button,
  Checkbox,
  Divider,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@dorado/components'
import { Lock, RotateCcw, Unlock } from '@dorado/icons'
import { outboundOf } from '../../../../shipping/queries'
import { usePatchShipment } from '../../../../shipping/queries'
import { useOrderShipments, usePatchPaymentDetails } from '@dorado/client'
import type { OrderLotPatch, OrderLotView, OrderSpot } from '@dorado/contracts'
import { cn } from '@/shared/utils/cn'
import { payoutMethodIcon, PayoutMethodType } from '@/shared/types/payouts'
import { usePaymentMethods } from '@dorado/client'
import {
  PurchaseOrderDrawerContentProps,
  statusConfig,
  StatusConfigEntry,
} from '@/shared/types/purchaseOrders'
import { useState } from 'react'
import { Product } from '@/shared/types/products'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { useProducts } from '@/shared/hooks/products/queries'
import {
  useCreateOrderLot,
  useDeleteOrderLot,
  useOrderSpots,
  usePatchOrderLot,
  useSetOrderSpots,
} from '@dorado/client'
import { byId } from '@/shared/utils/byId'
const METAL_ITEMS = ['Gold', 'Silver', 'Platinum', 'Palladium'].map((metal) => ({
  label: metal,
  value: metal,
}))

export default function AdminReceivedPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  const { data: spotPrices = [] } = useSpotPrices()
  // The metal's id IS its name (migration 132), so an order spot needs nothing
  // joined to it to be shown or mutated by.
  const { data: orderSpotPrices = [] } = useOrderSpots(order.id)

  const setSpots = useSetOrderSpots()
  const patchShipment = usePatchShipment()
  const patchPayout = usePatchPaymentDetails()
  const { data: payoutMethods = [] } = usePaymentMethods('purchase')

  // THE LINES, THE PARCEL AND THE PAYOUT ARE ALREADY HERE. This screen used
  // to call three more order-scoped reads for them; the view carries all
  // three, and each line carries its own `payable` and `line_total` besides.
  // A LINE IS A LOT (docs/waves/lots-build.md). `orders.items` is gone: the
  // link row carries this order's money (premium, price, confirmed) and
  // `row.lot` is the physical thing, whose id survives to the refiner.
  const { lots } = view
  const { data: catalogue = [] } = useProducts()
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)
  const payout = view.payout

  // bullion_id is the discriminator - null means scrap.
  const scrapItems = lots.filter((row) => row.lot.bullion_id === null)
  const bullionItems = lots.filter((row) => row.lot.bullion_id !== null)

  const handleUpdateSpot = (spot: OrderSpot, updated_spot: number) => {
    setSpots.mutate({ order_id: order.id, set: [{ metal_id: spot.metal_id, bid: updated_spot }] })
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
                variant="tertiary"
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
                    {spot.metal_id}
                  </small>

                  <div className="flex items-center gap-1 w-full">
                    <Input
                      type="number"
                      pattern="[0-9]*"
                      readOnly={!order.spots_locked}
                      inputClassName={cn(
                        'text-center h-8',
                        !order?.spots_locked && 'cursor-not-allowed'
                      )}
                      defaultValue={
                        spot?.bid ?? spotPrices?.find((s) => s.id === spot.metal_id)?.bid ?? ''
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
          <Divider />

          {bullionItems && (
            <div className="flex flex-col w-full gap-3">
              <div className="flex w-full justify-start items-center mb-2">
                <small className="tracking-widest">Bullion</small>
              </div>
              <BullionTable
                bullionItems={bullionItems}
                catalogue={catalogue}
                config={config}
                order_id={order.id}
              />
            </div>
          )}
          <Divider />

          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex-col items-start">
              <small>Shipping Charge</small>
              <Input
                type="number"
                pattern="[0-9]*"
                inputClassName={cn('text-right h-8')}
                defaultValue={shipment?.shipment.cost ?? 0}
                onBlur={(e) => {
                  if (!shipment?.shipment.id) return
                  patchShipment.mutate({
                    shipment_id: shipment.shipment.id,
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
                inputClassName={cn('text-right h-8')}
                defaultValue={payout?.cost ?? 0}
                onBlur={(e) => {
                  if (!payout?.id) return
                  patchPayout.mutate({
                    id: payout.id,
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
              checked={view.totals?.waive_payout_fee === true}
              disabled={!payout?.id}
              onCheckedChange={(checked) => {
                if (!payout?.id) return
                patchPayout.mutate({
                  id: payout.id,
                  order_id: order.id,
                  patch: { waive_payout_fee: checked === true },
                })
              }}
            />
            <small>Waive Payout Fee</small>
          </label>
          <Divider />

          {/* 'Accepted' left the lifecycle, and the change-payout affordance
              that keyed on it shows here at Received instead (Jacob's lean) -
              beside the payout charge it prices. */}
          <Select
            label="Change Payout Method"
            className="w-full"
            placeholder="Select a payout method"
            value={payout?.method ?? undefined}
            items={payoutMethods.map(({ label, type }) => {
              const Icon = payoutMethodIcon[type as PayoutMethodType]
              return {
                value: type,
                label: (
                  <span className="flex items-center gap-2">
                    {Icon && <Icon size={16} />}
                    {label}
                  </span>
                ),
              }
            })}
            onValueChange={(method) => {
              if (!payout?.id) return
              patchPayout.mutate({
                id: payout.id,
                order_id: order.id,
                patch: { method },
              })
            }}
          />
          <Divider />
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
  scrapItems: OrderLotView[]
  config: StatusConfigEntry
  order_id: string
}) {
  const [addMetal, setAddMetal] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const patchLot = usePatchOrderLot()
  const deleteLot = useDeleteOrderLot()
  const createLot = useCreateOrderLot()

  // ONE FLAT PATCH (D214 item 11): the row's own columns, at the top level -
  // a key present is written, an absent one is left alone. The old body sent
  // the full scrap object on every edit because the API's op SET every
  // column it knew; this sends only the field that changed.
  const handleUpdateItem = (row: OrderLotView, changes: OrderLotPatch) => {
    patchLot.mutate({ lot_id: row.id, order_id, patch: changes })
  }

  // Per-resource means one DELETE per line; the selection is small by
  // construction (checked rows in one drawer).
  const handleDeleteItems = (ids: string[]) => {
    for (const id of ids) deleteLot.mutate({ lot_id: id, order_id })
  }

  const handleSavedItems = (ids: string[]) => {
    for (const id of ids) {
      patchLot.mutate({ lot_id: id, order_id, patch: { confirmed: true } })
    }
  }

  const handleResetItem = (row: { id: string }) => {
    patchLot.mutate({ lot_id: row.id, order_id, patch: { confirmed: false } })
  }

  // The metal's id IS its name, so METAL_ITEMS' value is the column's value.
  const handleAddNew = (metal_id: string) => {
    if (!metal_id) return
    createLot.mutate({
      order_id,
      patch: { metal_id, pre_melt: 1, purity: 1, unit: 't oz' },
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
                  <TableCell className="text-left">{item.lot.metal_id}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="relative flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputClassName={cn('text-left h-6')}
                          defaultValue={item.lot.pre_melt ?? ''}
                          onBlur={(e) => {
                            const pre_melt = parseFloat(e.target.value)
                            if (!isNaN(pre_melt)) {
                              handleUpdateItem(item, { pre_melt })
                            }
                          }}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent">
                          {item.lot.unit}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.lot.pre_melt}</div>
                        <div>{item.lot.unit}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="relative flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputClassName={cn('text-left h-6')}
                          defaultValue={item.lot.post_melt ?? ''}
                          onBlur={(e) => {
                            const post_melt = parseFloat(e.target.value)
                            if (!isNaN(post_melt)) {
                              handleUpdateItem(item, { post_melt })
                            }
                          }}
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent">
                          {item.lot.unit}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <div>{item.lot.post_melt}</div>
                        <div>{item.lot.post_melt && item.lot.unit}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputClassName={cn('text-center h-6')}
                          defaultValue={item.lot.purity ?? ''}
                          onBlur={(e) => {
                            const purity = parseFloat(e.target.value)
                            if (!isNaN(purity)) {
                              handleUpdateItem(item, { purity })
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <>{((item.lot.purity ?? 0) * 100).toFixed(1)}%</>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputClassName={cn('text-center h-6')}
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
            <Select
              className="w-40"
              placeholder="Add New"
              disabled={editMode}
              value={addMetal}
              items={METAL_ITEMS}
              onValueChange={(metal) => {
                handleAddNew(metal)
                setAddMetal('')
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-center items-center">
          <Select
            className="max-w-42"
            placeholder="Add Scrap to Order"
            disabled={editMode}
            value={addMetal}
            items={METAL_ITEMS}
            onValueChange={(metal) => {
              handleAddNew(metal)
              setAddMetal('')
            }}
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
  bullionItems: OrderLotView[]
  // Reference data, resolved by the container and passed down - the row
  // carries bullion_id and nothing else about the product.
  catalogue: Product[]
  config: StatusConfigEntry
  order_id: string
}) {
  const [addBullionId, setAddBullionId] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { data: products = [] } = useProducts()

  const patchLot = usePatchOrderLot()
  const deleteLot = useDeleteOrderLot()
  const createLot = useCreateOrderLot()

  // ONE FLAT PATCH (D214 item 11): only the field that changed rides the
  // wire now - an absent key is left alone, so a quantity edit no longer has
  // to resend the current premium and vice versa.
  const handleUpdateItem = (row: OrderLotView, changes: OrderLotPatch) => {
    patchLot.mutate({ lot_id: row.id, order_id, patch: changes })
  }

  const handleDeleteItems = (ids: string[]) => {
    for (const id of ids) deleteLot.mutate({ lot_id: id, order_id })
  }

  const handleSavedItems = (ids: string[]) => {
    for (const id of ids) {
      patchLot.mutate({ lot_id: id, order_id, patch: { confirmed: true } })
    }
  }

  const handleResetItem = (row: { id: string }) => {
    patchLot.mutate({ lot_id: row.id, order_id, patch: { confirmed: false } })
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
    if (item) createLot.mutate({ order_id, patch: { bullion_id: item.id } })
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
                  <TableCell className="text-left">{item.lot.product_name}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className=" flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputClassName={cn('text-center h-6')}
                          defaultValue={item.lot.quantity ?? ''}
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
                        <div>{item.lot.quantity}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className="flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputClassName={cn('text-right h-6')}
                          defaultValue={
                            item.premium ?? byId(catalogue, item.lot.bullion_id)?.bid_premium ?? ''
                          }
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
                        {(
                          (item.premium ?? byId(catalogue, item.lot.bullion_id)?.bid_premium ?? 0) * 100
                        ).toFixed(1)}
                        %
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
            <Select
              className="w-48"
              placeholder="Add New"
              disabled={editMode}
              value={addBullionId}
              items={productItems}
              onValueChange={(id) => {
                handleAddNewById(id)
                setAddBullionId('')
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center">
          <Select
            className="max-w-70"
            placeholder="Add Bullion to Order"
            disabled={editMode}
            value={addBullionId}
            items={productItems}
            onValueChange={(id) => {
              handleAddNewById(id)
              setAddBullionId('')
            }}
          />
        </div>
      )}
    </>
  )
}
