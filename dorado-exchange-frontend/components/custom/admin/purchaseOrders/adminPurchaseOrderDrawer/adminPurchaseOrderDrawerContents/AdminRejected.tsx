import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useAddNewOrderBullionItem,
  useAddNewOrderScrapItem,
  useDeleteOrderItems,
  useLockOrderSpotPrices,
  useResetOrderItem,
  useResetOrderSpotPrices,
  useSaveOrderItems,
  useUpdateOrderBullionItem,
  useUpdateOrderScrapItem,
  useUpdateOrderSpotPrice,
} from '@/lib/queries/admin/useAdminPurchaseOrders'
import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { cn } from '@/lib/utils'
import { SpotPrice } from '@/types/metal'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerContentProps,
  PurchaseOrderItem,
  statusConfig,
  StatusConfigEntry,
} from '@/types/purchase-order'
import { Lock, Plus, RotateCcw, Unlock } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useProducts } from '@/lib/queries/useProducts'
import { Product } from '@/types/product'
import getPurchaseOrderTotal from '@/utils/purchaseOrders/purchaseOrderTotal'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import CountdownRing from '@/components/ui/countdown-ring'

export default function AdminRejectedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const updateSpot = useUpdateOrderSpotPrice()
  const lockSpots = useLockOrderSpotPrices()
  const resetSpots = useResetOrderSpotPrices()

  const rawScrapItems = order.order_items.filter((item) => item.item_type === 'scrap' && item.scrap)
  const scrapItems = assignScrapItemNames(rawScrapItems)
  const bullionItems = order.order_items.filter((item) => item.item_type === 'product')

  const handleUpdateSpot = (spot: SpotPrice, updated_spot: number) => {
    updateSpot.mutate({ spot, updated_spot })
  }

  const handleLockSpots = (spots: SpotPrice[], purchase_order_id: string) => {
    lockSpots.mutate({ spots, purchase_order_id })
  }

  const handleResetSpots = (purchase_order_id: string) => {
    resetSpots.mutate({ purchase_order_id })
  }

  const config = statusConfig[order.purchase_order_status]

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices)
  }, [order, spotPrices, orderSpotPrices])

  return (
    <>
      {order.offer_status === 'Rejected' ? (
        <div className="flex w-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex w-full justify-between items-center mb-2">
                <div className="text-xs tracking-widest text-neutral-600">Order Spots</div>
                <Button
                  variant="link"
                  className={cn(
                    config.text_color,
                    'p-0 font-normal text-sm h-4 hover:bg-transparent'
                  )}
                  onClick={() =>
                    order.spots_locked
                      ? handleResetSpots(order.id)
                      : handleLockSpots(spotPrices, order.id)
                  }
                  disabled={lockSpots.isPending || resetSpots.isPending}
                >
                  {order.spots_locked ? (
                    <div className="flex gap-1 items-center">
                      {resetSpots.isPending ? 'Unlocking...' : 'Unlock Spots'}
                      <Unlock size={16} />
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center">
                      {lockSpots.isPending ? 'Locking...' : 'Lock Spots'}
                      <Lock size={16} />
                    </div>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                {orderSpotPrices.map((spot) => (
                  <div key={spot.id} className="flex flex-col w-full">
                    <div className="flex items-center justify-between w-full text-sm text-neutral-700">
                      {spot.type}
                    </div>

                    <div className="flex items-center gap-1 w-full">
                      <Input
                        type="number"
                        pattern="[0-9]*"
                        inputMode="decimal"
                        readOnly={!order.spots_locked}
                        className={cn(
                          'input-floating-label-form no-spinner text-center w-full text-base h-8',
                          !order.spots_locked && 'cursor-not-allowed'
                        )}
                        value={
                          spot.bid_spot ??
                          spotPrices.find((s) => s.type === spot.type)?.bid_spot ??
                          ''
                        }
                        onChange={(e) => handleUpdateSpot(spot, Number(e.target.value))}
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
            <div className="separator-inset" />

            {bullionItems && (
              <div className="flex flex-col w-full gap-3">
                <div className="flex w-full justify-start items-center mb-2">
                  <div className="text-xs tracking-widest text-neutral-600">Bullion</div>
                </div>
                <BullionTable bullionItems={bullionItems} config={config} order_id={order.id} />
              </div>
            )}
            <div className="separator-inset" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full w-full gap-2 mb-4">
          <div className="flex flex-col w-full h-auto bg-card raised-off-page gap-2 p-4">
            <div className="flex w-full justify-between items-center">
              <div className="text-sm text-neutral-700">Offer Amount:</div>

              <div className="text-lg text-neutral-900">
                <PriceNumberFlow value={order.total_price ?? total} />
              </div>
            </div>
            <div className="flex w-full justify-between items-center">
              <div className="text-sm text-neutral-700">Spots:</div>
              <div className="text-lg text-neutral-900">
                {order.spots_locked ? 'Locked' : 'Unlocked'}
              </div>
            </div>
            <div className="flex w-full justify-between items-center">
              <div className="text-sm text-neutral-700">Total Rejections:</div>
              <div className="text-lg text-neutral-900">{order.num_rejections}</div>
            </div>
          </div>

          <div className="flex h-full w-full items-center justify-center">
            <CountdownRing
              sentAt={order.offer_sent_at!}
              expiresAt={order.offer_expires_at!}
              fillColor={config.stroke_color}
            />
          </div>
        </div>
      )}
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

  const updateOrderItem = useUpdateOrderScrapItem()
  const deleteOrderItems = useDeleteOrderItems()
  const resetOrderItem = useResetOrderItem()
  const saveOrderItems = useSaveOrderItems()
  const addNewItem = useAddNewOrderScrapItem()

  const handleUpdateItem = (item: PurchaseOrderItem) => {
    updateOrderItem.mutate(item)
  }

  const handleDeleteItems = (ids: string[]) => {
    deleteOrderItems.mutate({
      items: scrapItems.filter((item) => ids.includes(item.id)),
      purchase_order_id: order_id,
    })
  }

  const handleSavedItems = (ids: string[]) => {
    saveOrderItems.mutate({ ids: ids, purchase_order_id: order_id })
  }

  const handleResetItem = (item: PurchaseOrderItem) => {
    resetOrderItem.mutate({ id: item.id, purchase_order_id: order_id })
  }

  const handleAddNew = (metal: string) => {
    addNewItem.mutate({
      item: {
        metal,
        pre_melt: 1,
        purity: 1,
        content: 1,
        gross_unit: 't oz',
      },
      purchase_order_id: order_id,
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
                            'input-floating-label-form no-spinner text-left text-base h-6'
                          )}
                          defaultValue={item.scrap?.pre_melt}
                          onBlur={(e) => {
                            const pre_melt = parseFloat(e.target.value)
                            if (!isNaN(pre_melt)) {
                              const updatedItem = {
                                ...item,
                                scrap: {
                                  ...item.scrap!,
                                  pre_melt,
                                },
                              }
                              handleUpdateItem(updatedItem)
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
                            'input-floating-label-form no-spinner text-left text-base h-6'
                          )}
                          defaultValue={item.scrap?.post_melt}
                          onBlur={(e) => {
                            const post_melt = parseFloat(e.target.value)
                            if (!isNaN(post_melt)) {
                              const updatedItem = {
                                ...item,
                                scrap: {
                                  ...item.scrap!,
                                  post_melt,
                                },
                              }
                              handleUpdateItem(updatedItem)
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
                            'input-floating-label-form no-spinner text-center text-base h-6'
                          )}
                          defaultValue={item.scrap?.purity}
                          onBlur={(e) => {
                            const purity = parseFloat(e.target.value)
                            if (!isNaN(purity)) {
                              const updatedItem = {
                                ...item,
                                scrap: {
                                  ...item.scrap!,
                                  purity,
                                },
                              }
                              handleUpdateItem(updatedItem)
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
                            'input-floating-label-form no-spinner text-center text-base h-6'
                          )}
                          defaultValue={item.premium}
                          onBlur={(e) => {
                            const premium = parseFloat(e.target.value)
                            if (!isNaN(premium)) {
                              const updatedItem = {
                                ...item,
                                premium: premium,
                              }
                              handleUpdateItem(updatedItem)
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
                    config.background_color,
                    config.hover_background_color,
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
                    config.background_color,
                    config.hover_background_color,
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
                  'raised-off-page w-16 bg-card h-8 hover:text-white hover:border-none',
                  config.border_color,
                  config.text_color,
                  config.hover_background_color,
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
                    config.text_color,
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
                          config.text_color,
                          config.hover_background_color
                        )}
                      >
                        <span
                          className={cn(
                            'transition-colors',
                            config.text_color,
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
                  config.background_color,
                  config.hover_background_color,
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
                        config.text_color,
                        config.hover_background_color
                      )}
                    >
                      <span
                        className={cn(
                          'transition-colors',
                          config.text_color,
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
  const resetOrderItem = useResetOrderItem()
  const saveOrderItems = useSaveOrderItems()
  const { data: products = [] } = useProducts()

  const updateOrderItem = useUpdateOrderBullionItem()
  const deleteOrderItems = useDeleteOrderItems()
  const addNewItem = useAddNewOrderBullionItem()

  const handleUpdateItem = (item: PurchaseOrderItem) => {
    updateOrderItem.mutate(item)
  }

  const handleDeleteItems = (ids: string[]) => {
    deleteOrderItems.mutate({
      items: bullionItems.filter((item) => ids.includes(item.id)),
      purchase_order_id: order_id,
    })
  }

  const handleSavedItems = (ids: string[]) => {
    saveOrderItems.mutate({ ids: ids, purchase_order_id: order_id })
  }

  const handleResetItem = (item: PurchaseOrderItem) => {
    resetOrderItem.mutate({ id: item.id, purchase_order_id: order_id })
  }

  const handleAddNew = (item: Product) => {
    addNewItem.mutate({
      item: item,
      purchase_order_id: order_id,
    })
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
                  <TableCell className="text-left">{item.product?.product_name}</TableCell>
                  <TableCell className="text-center">
                    {editMode && selectedIds.includes(item.id) ? (
                      <div className=" flex justify-center">
                        <Input
                          type="number"
                          pattern="[0-9]*"
                          inputMode="decimal"
                          className={cn(
                            'input-floating-label-form no-spinner text-center text-base h-6'
                          )}
                          defaultValue={item.quantity}
                          onBlur={(e) => {
                            const quantity = parseFloat(e.target.value)
                            if (!isNaN(quantity)) {
                              const updatedItem = {
                                ...item,
                                quantity: quantity,
                                product: {
                                  ...item.product!,
                                },
                              }
                              handleUpdateItem(updatedItem)
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
                            'input-floating-label-form no-spinner text-right text-base h-6'
                          )}
                          defaultValue={item.premium ?? item.product?.bid_premium}
                          onBlur={(e) => {
                            const premium = parseFloat(e.target.value)
                            if (!isNaN(premium)) {
                              const updatedItem = {
                                ...item,
                                premium: premium,
                                product: {
                                  ...item.product!,
                                },
                              }
                              handleUpdateItem(updatedItem)
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
                    config.background_color,
                    config.hover_background_color,
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
                    config.background_color,
                    config.hover_background_color,
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
                  'raised-off-page w-16 bg-card h-8 hover:text-white hover:border-none',
                  config.border_color,
                  config.text_color,
                  config.hover_background_color,
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
                    config.text_color,
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
                          config.text_color,
                          config.hover_background_color
                        )}
                      >
                        <span
                          className={cn(
                            'transition-colors group-hover:text-white',
                            config.text_color
                          )}
                        >
                          {product.product_name}
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
                  config.background_color,
                  config.hover_background_color,
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
                        config.text_color,
                        config.hover_background_color
                      )}
                    >
                      <span
                        className={cn(
                          'transition-colors group-hover:text-white',
                          config.text_color
                        )}
                      >
                        {product.product_name}
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
