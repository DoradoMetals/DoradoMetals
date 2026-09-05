'use client'

import Image from 'next/image'
import { Product } from '@/features/products/types'
import { Amount, Button, RadioGroup, RadioOption } from '@dorado/components'
import { CircleHelp, Equal, Minus, Plus, Scale, X } from '@dorado/icons'
import NumberFlow from '@number-flow/react'
import { BullionFloatingButton, BullionFloatingButtonItem } from '@/features/products/ui/FloatingButton'
import { useState } from 'react'
import { Tooltip, TooltipProvider } from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { useBasket, useCheckoutItemActions } from '@/features/checkout/items/queries'
import { useProductQuote } from '@/features/quotes/queries'
import { useSpotPrices } from '@dorado/client'

type BullionCardProps = {
  product: Product
  variants: Product[]
}

export default function BullionCard({ product, variants }: BullionCardProps) {
  // The server picks the family's headline row and orders the siblings
  // (heaviest first), so there is nothing to sort here.
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const [variantsOpen, setVariantsOpen] = useState(false)

  const items = useBasket('purchase')
  const { addItem, removeOne } = useCheckoutItemActions()

  const row = items.find((i) => i.bullion_id === selectedProduct.id)
  const quantity = row?.quantity ?? 0
  const removeOneOf = (direction: 'purchase') => row && removeOne(direction, row)

  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.id === selectedProduct.metal_id)
  const { data: quote } = useProductQuote(selectedProduct.id, 'bid')
  const price = quote?.unit_price ?? 0

  // OVER OR UNDER SPOT IS THE QUOTE'S OWN `premium`. It used to be
  // `unit_price - content * ticker`, whose own comment admitted it drifted by
  // content * the spot's movement between two independent 10s refreshes.
  const overOrUnder = quote?.premium ?? 0
  const isOver = overOrUnder >= 0

  return (
    <div className="flex flex-col bg-card w-full h-auto group relative items-center mx-auto z-20 rounded-lg border border-border">
      <div className="flex justify-between w-full h-36 sm:h-44 md:h-52">
        <div className="flex flex-items-center">
          <div className="relative aspect-square w-32 h-36 sm:w-40 sm:h-44 md:w-48 md:h-52">
            <Image
              src={selectedProduct.image_front}
              fill
              className="object-cover"
              alt="thumbnail front"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
          <div className="flex flex-col h-full justify-between py-2 mr-auto gap-4">
            <div className="flex flex-col gap-1">
              <h4>{selectedProduct.name}</h4>
              {/* Was two sibling divs each carrying the same responsive pair;
                  it is one sentence, so it is one paragraph. */}
              <p className="flex items-center gap-1">
                <Amount value={Math.abs(overOrUnder)} />
                {isOver ? 'over' : 'under'} spot
              </p>
            </div>
            <div className="flex items-end h-full mt-auto">
              <div className="flex items-baseline gap-1">
                <strong className="stat-sm">
                  <Amount value={price} />
                </strong>
                <small>per unit</small>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between items-end pt-3 pb-2 pr-2 sm:pr-3 md:pr-4 lg:pr-5">
          <AnimatePresence>
            {!variantsOpen && (
              <motion.div
                className="pr-2 md:pr-3 will-change-transform"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  duration: 0.2,
                  ease: 'easeInOut',
                  delay: 0.2,
                }}
              >
                <TooltipProvider>
                  <Tooltip
                    side="bottom"
                    content={
                      <div className="flex w-56 flex-col gap-2">
                        <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                          <div className={cn('flex w-full items-center justify-between gap-2', 'items-start pl-8')}>
                            <small>{selectedProduct.metal_id} Bid Price</small>
                            <p>
                              <Amount value={spot?.bid ?? 0} />
                            </p>
                          </div>

                          <div className="flex w-full items-start">
                            <X size={16} className="text-subtle" />

                            <div className={cn('flex w-full items-center justify-between gap-2', 'items-start pl-4')}>
                              <small>Content (oz)</small>
                              <p>{selectedProduct.content}</p>
                            </div>
                          </div>

                          <div className="flex w-full items-start">
                            {overOrUnder >= 0 ? (
                              <Plus size={16} className="text-subtle" />
                            ) : (
                              <Minus size={16} className="text-subtle" />
                            )}

                            <div className={cn('flex w-full items-center justify-between gap-2', 'items-start pl-4')}>
                              <small>Premium</small>
                              <p>
                                <Amount value={Math.abs(overOrUnder)} />
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex w-full items-start">
                          <Equal size={16} className="text-subtle" />
                          <div className={cn('flex w-full items-center justify-between gap-2', 'items-start pl-4')}>
                            <small>Total</small>
                            <strong>
                              <Amount value={price} />
                            </strong>
                          </div>
                        </div>
                      </div>
                    }
                  >
                    <Button variant="tertiary" size="iconXs">
                      <CircleHelp size={20} />
                    </Button>
                  </Tooltip>
                </TooltipProvider>
              </motion.div>
            )}
          </AnimatePresence>

          {variants.length > 0 && (
            <div className="mt-auto">
              <RadioGroup
                value={selectedProduct.name}
                onValueChange={(val) => {
                  const variant = variants.find((v) => v.name === val)
                  if (variant) setSelectedProduct(variant)
                }}
              >
                <BullionFloatingButton
                  isOpen={variantsOpen}
                  setIsOpen={setVariantsOpen}
                  triggerContent={
                    <Button size="iconXs" className="z-10">
                      <Scale size={16} />
                    </Button>
                  }
                >
                  {variants.map((option) => (
                      <BullionFloatingButtonItem key={option.id}>
                        <RadioOption
                          value={option.name}
                          variant="segment"
                          className="h-5.5 w-8 px-0 xs:w-12 sm:h-7 sm:w-14 md:h-8.5 lg:h-9"
                        >
                          {option.variant_label}
                        </RadioOption>
                    </BullionFloatingButtonItem>
                  ))}
                </BullionFloatingButton>
              </RadioGroup>
            </div>
          )}
        </div>
      </div>

      <div className="w-full px-4 pb-4">
        {quantity === 0 ? (
          <Button
            className="w-full"
            onClick={() => addItem('purchase', { bullion_id: selectedProduct.id, quantity: 1 })}
          >
            Sell to Us
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <Button
              size="icon"
              onClick={() => removeOneOf('purchase')}
            >
              <Minus size={20} />
            </Button>
            <NumberFlow value={quantity} trend={0} />
            <Button
              size="icon"
              onClick={() =>
                addItem('purchase', { bullion_id: selectedProduct.id, quantity: 1 })
              }
            >
              <Plus size={20} />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
