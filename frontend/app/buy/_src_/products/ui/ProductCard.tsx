'use client'

import Image from 'next/image'
import { Product } from '@/shared/types/products'
import { Amount, Button, Carousel, RadioGroup, RadioOption } from '@dorado/components'
import { CircleHelp, Equal, Minus, Plus, Scale, X } from '@dorado/icons'
import NumberFlow from '@number-flow/react'
import { FloatingButton, FloatingButtonItem } from '@/shared/ui/FloatingButton'

import { useState } from 'react'
import { useBasket, useCheckoutItemActions } from '@/shared/hooks/checkout/items/queries'
import { useProductQuote } from '@/shared/hooks/quotes/queries'

import { Tooltip, TooltipProvider } from '@dorado/components'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useSpotPrices } from '@dorado/client'
import { cn } from '@/shared/utils/cn'

type ProductCardProps = {
  product: Product
  variants: Product[]
}

export default function ProductCard({ product, variants }: ProductCardProps) {
  const router = useRouter()
  // The server picks the family's headline row and orders the siblings
  // (heaviest first), so there is nothing to sort here.
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const [variantsOpen, setVariantsOpen] = useState(false)

  const items = useBasket('sale')
  const { addItem, removeOne } = useCheckoutItemActions()

  const row = items.find((i) => i.bullion_id === selectedProduct.id)
  const quantity = row?.quantity ?? 0
  const removeOneOf = (direction: 'sale') => row && removeOne(direction, row)
  const { data: spotPrices = [] } = useSpotPrices()

  // Keyed by the metal's ID, which the row carries - matching on the NAME
  // was a string comparison between two independent reads.
  const spot = spotPrices.find((s) => s.id === selectedProduct.metal_id)
  const { data: quote } = useProductQuote(selectedProduct.id, 'ask')
  const price = quote?.unit_price ?? 0

  // OVER OR UNDER SPOT IS THE QUOTE'S OWN `premium`. It used to be
  // `unit_price - content * ticker`, whose own comment admitted it drifted by
  // content * the spot's movement between two independent 10s refreshes.
  const overOrUnder = quote?.premium ?? 0
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
                <TooltipProvider>
                  <Tooltip
                    side="top"
                    content={
                      <div className="flex w-56 flex-col gap-2">
                        <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                          <div className={cn('flex w-full items-center justify-between gap-2', 'items-start pl-8')}>
                            <small>{selectedProduct.metal_id} Spot Price</small>
                            <p>
                              <Amount value={spot?.ask ?? 0} />
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
                    <Button
                      variant="tertiary"
                      size="iconXs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CircleHelp size={20} />
                    </Button>
                  </Tooltip>
                </TooltipProvider>
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
                  <Amount value={price} />
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
                  addItem('sale', { bullion_id: selectedProduct.id, quantity: 1 })
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
                    removeOneOf('sale')
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} trend={0} />
                <Button
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    addItem('sale', { bullion_id: selectedProduct.id, quantity: 1 })
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
