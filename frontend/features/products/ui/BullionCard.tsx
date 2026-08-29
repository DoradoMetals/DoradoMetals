'use client'

import Image from 'next/image'
import { Product } from '@/features/products/types'
import { Button } from '@/shared/ui/base/button'
import { CircleHelp, Equal, Minus, Plus, Scale, X } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { RadioGroupRoot, RadioOption } from '@/shared/ui/RadioGroup'
import { BullionFloatingButton, BullionFloatingButtonItem } from '@/features/products/ui/FloatingButton'
import { useState } from 'react'
import { PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Popover } from '@radix-ui/react-popover'
import { cn } from '@/shared/utils/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { useSpotPrices } from '@/features/spots/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { DetailRow } from '@/shared/ui/DetailRow'

type BullionCardProps = {
  product: Product
  variants: Product[]
  // The page's batch catalog quote (bid side), unit_price by product id - the
  // page quotes ONCE for the whole list and every selectable variant, so a
  // card never fires its own request (see features/quotes/catalogPrices.ts).
  unitPrices: Record<string, number>
}

export default function BullionCard({ product, variants, unitPrices }: BullionCardProps) {
  const initialVariant =
    variants.length > 0 ? [...variants].sort((a, b) => b.content - a.content)[0] : product

  const [selectedProduct, setSelectedProduct] = useState<Product>(initialVariant)
  const [open, setOpen] = useState(false)
  const [variantsOpen, setVariantsOpen] = useState(false)

  const items = sellCartStore((state) => state.items)
  const addItem = sellCartStore((state) => state.addItem)
  const removeOne = sellCartStore((state) => state.removeOne)

  const cartItem = items.find(
    (item) =>
      item.type === 'product' &&
      (item.data as Product).name === selectedProduct.name
  )
  const quantity = cartItem?.data.quantity ?? 0

  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.name === selectedProduct.metal_type)
  const price = unitPrices[selectedProduct.id] ?? 0

  // DERIVED, like ProductCard's ask popover: quoted unit_price minus melt
  // (content * ticker bid) is the same over/under the old client math
  // (content * bid * (premium - 1)) showed whenever the quote and the ticker
  // read the same spot tick; between their 10s refreshes it can differ by
  // content * the spot's movement. Zero until the quote lands.
  const overOrUnder = price === 0 ? 0 : price - selectedProduct.content * (spot?.bid ?? 0)
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
                <PriceNumberFlow value={Math.abs(overOrUnder)} />
                {isOver ? 'over' : 'under'} spot
              </p>
            </div>
            <div className="flex items-end h-full mt-auto">
              <div className="flex items-baseline gap-1">
                <h3>
                  <PriceNumberFlow value={price} />
                </h3>
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
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="tertiary" size="iconXs" onClick={() => setOpen(true)}>
                      <CircleHelp size={20} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    className="p-2 w-56"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    forceMount
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        duration: 0.2,
                        ease: 'easeInOut',
                        delay: 0.2,
                      }}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                          <DetailRow label={<>{spot?.name} Bid Price</>} variant="detail" className="items-start pl-8">
                            <PriceNumberFlow value={spot?.bid ?? 0} />
                          </DetailRow>

                          <div className="flex w-full items-start">
                            <X size={16} className="text-neutral-700" />

                            <DetailRow label="Content (oz)" variant="detail" className="items-start pl-4">{selectedProduct.content}</DetailRow>
                          </div>

                          <div className="flex w-full items-start">
                            {overOrUnder >= 0 ? (
                              <Plus size={16} className="text-neutral-700" />
                            ) : (
                              <Minus size={16} className="text-neutral-700" />
                            )}

                            <DetailRow label="Premium" variant="detail" className="items-start pl-4">
                              <PriceNumberFlow value={Math.abs(overOrUnder)} />
                            </DetailRow>
                          </div>
                        </div>
                        <div className="flex w-full items-start">
                          <Equal size={16} className="text-neutral-700" />
                          <DetailRow label="Total" variant="subtotal" className="items-start pl-4">
                            <PriceNumberFlow value={price} />
                          </DetailRow>
                        </div>
                      </div>
                    </motion.div>
                  </PopoverContent>
                </Popover>
              </motion.div>
            )}
          </AnimatePresence>

          {variants.length > 0 && (
            <div className="mt-auto">
              <RadioGroupRoot
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
                  {[...variants]
                    .sort((a, b) => b.content - a.content)
                    .map((option) => (
                      <BullionFloatingButtonItem key={option.id}>
                        {/* Composed from `RadioOption` rather than
                            `<RadioGroup options>` because each option is
                            wrapped in a BullionFloatingButtonItem, and a render
                            prop cannot wrap the label it is rendered inside. */}
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
              </RadioGroupRoot>
            </div>
          )}
        </div>
      </div>

      <div className="w-full px-4 pb-4">
        {quantity === 0 ? (
          <Button
            className="w-full"
            onClick={() => addItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })}
          >
            Add to Sell Cart
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <Button
              size="icon"
              onClick={() => removeOne({ type: 'product', data: selectedProduct })}
            >
              <Minus size={20} />
            </Button>
            <NumberFlow value={quantity} trend={0} />
            <Button
              size="icon"
              onClick={() =>
                addItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
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
