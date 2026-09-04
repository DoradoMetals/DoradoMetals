'use client'

import Image from 'next/image'
import { Product } from '@/features/products/types'
import { Button, Carousel, CircleHelp, Equal, Minus, Plus, RadioGroup, RadioOption, Scale, X } from '@dorado/components'
import NumberFlow from '@number-flow/react'
import { FloatingButton, FloatingButtonItem } from '@/features/products/ui/FloatingButton'

import { useState } from 'react'
import { useBasket, useCheckoutItemActions } from '@/features/checkout/items/queries'
import { lineFromProduct } from '@/features/checkout/items/types'

import { PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Popover } from '@radix-ui/react-popover'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useSpotPrices } from '@dorado/client'
import { DetailRow } from '@/shared/ui/DetailRow'

type ProductCardProps = {
  product: Product
  variants: Product[]
  // The page's batch catalog quote, unit_price by product id - the page
  // quotes ONCE for the whole grid and every selectable variant, so a card
  // never fires its own request (see features/quotes/catalogPrices.ts).
  unitPrices: Record<string, number>
}

export default function ProductCard({ product, variants, unitPrices }: ProductCardProps) {
  const router = useRouter()
  // The server picks the family's headline row and orders the siblings
  // (heaviest first), so there is nothing to sort here.
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const [open, setOpen] = useState(false)
  const [variantsOpen, setVariantsOpen] = useState(false)

  const items = useBasket('sale')
  const { addItem, removeOne } = useCheckoutItemActions()

  const quantity = items.find((i) => i.bullion_id === selectedProduct.id)?.quantity ?? 0
  const { data: spotPrices = [] } = useSpotPrices()

  // Keyed by the metal's ID, which the row carries - matching on the NAME
  // was a string comparison between two independent reads.
  const spot = spotPrices.find((s) => s.id === selectedProduct.metal_id)
  const price = unitPrices[selectedProduct.id] ?? 0

  // The popover's premium line, DERIVED: quoted unit_price minus melt
  // (content * ticker ask). Same number the old client math (content * ask *
  // (premium - 1)) showed whenever the quote and the ticker read the same
  // spot tick; between their 10s refreshes it can differ by content * the
  // spot's movement. Zero until the quote lands, so a loading card never
  // shows melt as a discount.
  const overOrUnder = price === 0 ? 0 : price - selectedProduct.content * (spot?.ask ?? 0)
  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer space-y-4 h-[32rem] max-w-[22rem] group relative flex-col items-center mx-auto z-0"
      onClick={() => {
        router.push(`/buy/${selectedProduct.slug}`)
      }}
      onKeyDown={(e) => {
        // role="button" with tabIndex and no key handler is one of D93's
        // clickable divs. Guarded on currentTarget so Enter inside the nested
        // buttons does not also navigate.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(`/buy/${selectedProduct.slug}`)
        }
      }}
    >
      <div className="h-1/5 rounded-lg mb-8">
        <div className="relative w-full aspect-[4/3]">
          <Carousel label={`${selectedProduct.name} photos`} slideClassName="w-full">
            <div className="flex relative aspect-square pb-4">
              <Image
                src={selectedProduct.image_front}
                width={500}
                height={500}
                className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
                alt="thumbnail front"
              />
            </div>
            <div className="flex relative aspect-square pb-4">
              <Image
                src={selectedProduct.image_back}
                width={500}
                height={500}
                className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
                alt="thumbnail back"
              />
            </div>
          </Carousel>
        </div>
      </div>

      <div className="relative h-4/5 bg-card rounded-lg rounded-b-xl -mt-10 flex flex-col justify-end border border-border">
        <div className="flex items-end justify-between w-full px-3 pr-5 pb-2">
          {variants.length > 0 && (
            <RadioGroup
              value={selectedProduct.name}
              onValueChange={(val) => {
                const variant = variants.find((v) => v.name === val)
                if (variant) setSelectedProduct(variant)
              }}
            >
              <FloatingButton
                isOpen={variantsOpen}
                setIsOpen={setVariantsOpen}
                triggerContent={
                  <Button
                    size="iconSm"
                    className="z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      setVariantsOpen(true)
                    }}
                  >
                    <Scale size={16} />
                  </Button>
                }
              >
                {variants.map((option) => (
                    <FloatingButtonItem key={option.id}>
                      <RadioOption
                        value={option.name}
                        variant="segment"
                        className="h-8 w-10 px-0 xs:w-14 sm:w-15"
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        {option.variant_label}
                      </RadioOption>
                  </FloatingButtonItem>
                ))}
              </FloatingButton>
            </RadioGroup>
          )}

          <AnimatePresence>
            {!variantsOpen && (
              <motion.div
                className="flex flex-col items-end justify-end ml-auto will-change-transform"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  duration: 0.2,
                  ease: 'easeInOut',
                  delay: 0.05,
                }}
              >
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="tertiary"
                      size="iconXs"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen(true)
                      }}
                    >
                      <CircleHelp size={20} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="top"
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
                          <DetailRow label={<>{spot?.name} Spot Price</>} variant="detail" className="items-start pl-8">
                            <PriceNumberFlow value={spot?.ask ?? 0} />
                          </DetailRow>

                          <div className="flex w-full items-start">
                            <X size={16} className="text-subtle" />
                            <DetailRow label="Content (oz)" variant="detail" className="items-start pl-4">{selectedProduct.content}</DetailRow>
                          </div>

                          <div className="flex w-full items-start">
                            {overOrUnder >= 0 ? (
                              <Plus size={16} className="text-subtle" />
                            ) : (
                              <Minus size={16} className="text-subtle" />
                            )}

                            <DetailRow label="Premium" variant="detail" className="items-start pl-4">
                              <PriceNumberFlow value={Math.abs(overOrUnder)} />
                            </DetailRow>
                          </div>
                        </div>

                        <div className="flex w-full items-start">
                          <Equal size={16} className="text-subtle" />
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
        </div>
        <div className="space-y-4">
          <div className="px-6">
            <div className="flex items-start">
              <div className="flex flex-col mr-auto">
                <h5>{selectedProduct.name}</h5>
                <small className="mr-auto">{selectedProduct.mint_name}</small>
              </div>

              <div className="flex flex-col items-end gap-1 ml-auto my-0">
                <strong className="stat-sm">
                  <PriceNumberFlow value={price} />
                </strong>
              </div>
            </div>
          </div>

          <div
            className="w-full px-4 pb-4"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            {quantity === 0 ? (
              <Button
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation()
                  addItem('sale', lineFromProduct(selectedProduct))
                }}
              >
                Add to Checkout
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeOne('sale', lineFromProduct(selectedProduct))
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} trend={0} />
                <Button
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    addItem('sale', lineFromProduct(selectedProduct))
                  }}
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
