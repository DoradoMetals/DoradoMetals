'use client'

import Image from 'next/image'
import { ozOptions, Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { CircleHelp, Equal, Minus, Plus, Scale, X } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { BullionFloatingButton, BullionFloatingButtonItem } from '@/components/ui/floating-button'
import { useState } from 'react'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getProductBidPrice from '@/utils/getProductBidPrice'
import { PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Popover } from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import getProductBidOverUnderSpot from '@/utils/getProductBidOverUnderSpot'
import { sellCartStore } from '@/store/sellCartStore'

type BullionCardProps = {
  product: Product
  variants: Product[]
}

export default function BullionCard({ product, variants }: BullionCardProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const [open, setOpen] = useState(false)
  const [variantsOpen, setVariantsOpen] = useState(false)

  const items = sellCartStore((state) => state.items)
  const addItem = sellCartStore((state) => state.addItem)
  const removeOne = sellCartStore((state) => state.removeOne)

  const cartItem = items.find(
    (item) =>
      item.type === 'product' &&
      (item.data as Product).product_name === selectedProduct.product_name
  )
  const quantity = cartItem?.data.quantity ?? 0

  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.type === selectedProduct.metal_type)
  const price = getProductBidPrice(selectedProduct, spot)
  const weightOptions = ozOptions[product.variant_group]

  const overOrUnder = getProductBidOverUnderSpot(selectedProduct, spot)
  const isOver = overOrUnder >= 0

  return (
    <div className="flex flex-col bg-card w-full h-auto group relative items-center mx-auto z-50 raised-off-page rounded-lg">
      <div className="flex justify-between w-full h-36 sm:h-44 md:h-52">
        <div className="flex flex-items-center">
          <div className="relative aspect-square w-32 h-36 sm:w-40 sm:h-44 md:w-48 md:h-52">
            <Image
              src={selectedProduct.image_front}
              fill
              className="object-cover"
              alt="thumbnail front"
            />
          </div>
          <div className="flex flex-col h-full justify-between py-2 mr-auto gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-sm sm:text-base md:text-lg lg:text-xl text-neutral-800">
                {selectedProduct.product_name}
              </div>
              <div className="flex items-center gap-1 text-xs text-neutral-600">
                <div className="text-sm sm:text-base text-neutral-800">
                  <PriceNumberFlow value={Math.abs(overOrUnder)} />
                </div>
                <div className="text-sm sm:text-base text-neutral-600">
                  {isOver ? 'over' : 'under'} spot
                </div>
              </div>
            </div>
            <div className="flex items-end h-full mt-auto">
              <div className="flex items-center gap-1">
                <div className="text-lg sm:text-xl md:text-2xl text-neutral-800 font-semibold">
                  <PriceNumberFlow value={price} />
                </div>
                <div className="text-base text-neutral-600">per unit</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between items-end pt-3 pb-2 pr-2 sm:pr-3 md:pr-4 lg:pr-5">
          <AnimatePresence>
            {!variantsOpen && (
              <motion.div
                className="pr-2 md:pr-3"
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
                    <Button
                      variant="ghost"
                      className="text-neutral-500 hover:text-neutral-900 p-0 h-5"
                      onClick={() => setOpen(true)}
                    >
                      <CircleHelp size={20} className="p-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    className="p-2 bg-background border-border border-1 shadow-lg w-[14rem]"
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
                          <div className="flex w-full items-start justify-between pl-8">
                            <div className="text-xs text-neutral-600">{spot?.type} Bid Price</div>
                            <div className="text-sm">
                              <PriceNumberFlow value={spot?.bid_spot ?? 0} />
                            </div>
                          </div>

                          <div className="flex w-full items-start">
                            <X size={16} className="text-neutral-700 px-0" />

                            <div className="flex w-full items-start justify-between pl-4">
                              <div className="text-xs text-neutral-600">Content (oz)</div>
                              <div className="text-sm">{selectedProduct.content}</div>
                            </div>
                          </div>

                          <div className="flex w-full items-start">
                            {overOrUnder >= 0 ? (
                              <Plus size={16} className="text-neutral-700 px-0" />
                            ) : (
                              <Minus size={16} className="text-neutral-700 px-0" />
                            )}

                            <div className="flex w-full items-start justify-between pl-4">
                              <div className="text-xs text-neutral-600">Premium</div>
                              <div className="text-sm">
                                <PriceNumberFlow value={Math.abs(overOrUnder)} />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex w-full items-start">
                          <Equal size={16} className="text-neutral-700 px-0" />
                          <div className="flex w-full items-start justify-between pl-4">
                            <div className="text-xs text-neutral-600">Total</div>
                            <div className="text-sm text-neutral-900">
                              <PriceNumberFlow value={price} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </PopoverContent>
                </Popover>
              </motion.div>
            )}
          </AnimatePresence>

          {variants.length > 0 && weightOptions && (
            <div className="mt-auto">
              <RadioGroup
                value={selectedProduct.product_name}
                onValueChange={(val) => {
                  const variant = variants.find((v) => v.product_name === val)
                  if (variant) setSelectedProduct(variant)
                }}
              >
                <BullionFloatingButton
                  isOpen={variantsOpen}
                  setIsOpen={setVariantsOpen}
                  triggerContent={
                    <Button
                      variant="ghost"
                      className="flex items-center h-7 w-7 rounded-full items-center justify-center z-10 liquid-gold text-white hover:text-white p-0 raised-off-page"
                    >
                      <Scale size={16} />
                    </Button>
                  }
                >
                  {weightOptions.map((option) => {
                    const isSelected = selectedProduct.product_name === option.name

                    return (
                      <BullionFloatingButtonItem key={option.name}>
                        <label
                          htmlFor={option.value}
                          className={cn(
                            'h-5.5 sm:h-7 md:h-8.5 lg:h-9 w-8 xs:w-12 sm:w-14 rounded-lg flex items-center justify-center text-xs cursor-pointer border text-neutral-900 raised-off-page',
                            isSelected && 'liquid-gold text-white'
                          )}
                        >
                          <RadioGroupItem
                            id={option.value}
                            value={option.name}
                            className="sr-only"
                            disabled={option.disabled}
                          />
                          {option.value}
                        </label>
                      </BullionFloatingButtonItem>
                    )
                  })}
                </BullionFloatingButton>
              </RadioGroup>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          'liquid-gold w-full rounded-b-lg text-white',
          quantity === 0 ? 'shine-on-hover' : ''
        )}
      >
        {quantity === 0 ? (
          <Button
            variant="ghost"
            className="bg-transparent w-full hover:bg-transparent text-white hover:text-white"
            onClick={() => addItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })}
          >
            Add to Cart
          </Button>
        ) : (
          <div className="flex items-center justify-center">
            <Button
              variant="ghost"
              className="text-white hover:text-white"
              onClick={() => removeOne({ type: 'product', data: selectedProduct })}
            >
              <Minus size={20} />
            </Button>
            <NumberFlow value={quantity} className="text-white text-lg font-semibold" trend={0} />
            <Button
              variant="ghost"
              className="text-white hover:text-white"
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
