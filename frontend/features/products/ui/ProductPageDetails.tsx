'use client'

import Image from 'next/image'
import { Product } from '@/features/products/types'
import { Button } from '@/shared/ui/base/button'
import { Equal, Minus, Plus, X } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { RadioGroup } from '@/shared/ui/RadioGroup'

import { useState } from 'react'
import { cartStore } from '@/shared/store/cartStore'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import { cn } from '@/shared/utils/cn'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  TagIcon,
} from '@phosphor-icons/react'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { Lens } from '@/shared/ui/base/lens'
import { paymentOptions, salesOrderServiceOptions } from '@/features/orders/salesOrders/types'
import { useSpotPrices } from '@/features/spots/queries'
import { useCatalogQuote } from '@/features/quotes/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import AccordionSection from '@/shared/ui/AccordionSection'

type ProductPageProps = {
  product: Product
  variants: Product[]
}

export default function ProductPageDetails({ product, variants }: ProductPageProps) {
  const initialVariant =
    variants.length > 0 ? [...variants].sort((a, b) => b.content - a.content)[0] : product

  const [selectedProduct, setSelectedProduct] = useState<Product>(initialVariant)
  const [selectedImage, setSelectedImage] = useState<string>(product.image_front)
  const [hovering, setHovering] = useState(false)

  const [open, setOpen] = useState({
    description: false,
    price: false,
    buyback: false,
    shipping: false,
    payment: false,
    specs: false,
  })

  const items = cartStore((state) => state.items)
  const addItem = cartStore((state) => state.addItem)
  const removeOne = cartStore((state) => state.removeOne)
  const cartItem = items.find((item) => item.name === selectedProduct.name)
  const quantity = cartItem?.quantity ?? 0

  const sellItems = sellCartStore((state) => state.items)
  const addSellItem = sellCartStore((state) => state.addItem)
  const removeOneSell = sellCartStore((state) => state.removeOne)
  const sellCartItem = sellItems.find(
    (item) =>
      item.type === 'product' &&
      (item.data as Product).name === selectedProduct.name
  )
  const sellQuantity = sellCartItem?.data.quantity ?? 0

  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.name === product.metal_type)

  // The page's own single-item quotes, one per side, re-quoted when the
  // selected variant changes. Each side only where the product is live in it:
  // ask is gated on `display` (already true - the slug read itself filters
  // it), bid on `sell_display`, because the server refuses the gated side
  // with a 400 rather than pricing it. A product not for sale back quotes a
  // buyback of zero.
  const { data: askQuote } = useCatalogQuote([{ id: selectedProduct.id }], 'ask')
  const { data: bidQuote } = useCatalogQuote(
    selectedProduct.sell_display ? [{ id: selectedProduct.id }] : [],
    'bid'
  )

  const price = askQuote?.items[0]?.unit_price ?? 0
  const buybackPrice = bidQuote?.items[0]?.unit_price ?? 0

  // The breakdowns' premium lines, DERIVED as on the cards: quoted price
  // minus melt (content * ticker spot). Identical to the old client math
  // (content * spot * (premium - 1)) whenever the quote and the ticker read
  // the same spot tick; between their 10s refreshes they can differ by
  // content * the spot's movement. Zero until a quote lands.
  const askOverOrUnder =
    price === 0 ? 0 : price - selectedProduct.content * (spot?.ask ?? 0)
  const bidOverOrUnder =
    buybackPrice === 0 ? 0 : buybackPrice - selectedProduct.content * (spot?.bid ?? 0)

  return (
    <div>
      <div className="hidden lg:flex items-start w-5xl flex-1 gap-4">
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              'w-20 h-20 bg-background rounded-lg cursor-pointer transition-all border',
              selectedImage === selectedProduct.image_front ? 'bg-card border-primary' : 'border-border'
            )}
            onClick={() => setSelectedImage(selectedProduct.image_front)}
          >
            <Image
              src={selectedProduct.image_front}
              height={500}
              width={500}
              className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
              alt="Front thumbnail"
            />
          </div>
          <div
            className={cn(
              'w-20 h-20 bg-background rounded-lg cursor-pointer transition-all border',
              selectedImage === selectedProduct.image_back ? 'bg-card border-primary' : 'border-border'
            )}
            onClick={() => setSelectedImage(selectedProduct.image_back)}
          >
            <Image
              src={selectedProduct.image_back}
              height={500}
              width={500}
              className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
              alt="Back thumbnail"
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full h-full">
          <div className="flex relative aspect-square bg-card border border-border rounded-lg h-full w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full h-full"
              >
                <Lens hovering={hovering} setHovering={setHovering}>
                  <Image
                    src={selectedImage}
                    height={1000}
                    width={1000}
                    className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
                    alt="Selected product view"
                  />
                  <p className="absolute bottom-0 left-1 flex justify-start eyebrow p-2">
                    {selectedImage === selectedProduct.image_front ? 'Obverse' : 'Reverse'}
                  </p>
                </Lens>
              </motion.div>
            </AnimatePresence>
          </div>
          {variants.length > 0 && (
            <RadioGroup
              value={selectedProduct.name}
              onValueChange={(val) => {
                const variant = variants.find((v) => v.name === val)
                if (variant) setSelectedProduct(variant)
              }}
              options={[...variants].sort((a, b) => b.content - a.content)}
              getValue={(option) => option.name}
              variant="segment"
              className="flex w-full gap-3"
              optionClassName="w-full"
            >
              {(option) => option.variant_label}
            </RadioGroup>
          )}
          <div className="w-full">
            {quantity === 0 ? (
              <Button
                className="w-full"
                onClick={() => {
                  addItem(selectedProduct)
                }}
              >
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={() => {
                    removeOne(selectedProduct)
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} trend={0} />
                <Button
                  size="icon"
                  onClick={() => {
                    addItem(selectedProduct)
                  }}
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
          <div className="w-full">
            {sellQuantity === 0 ? (
              <Button
                className="w-full"
                onClick={() =>
                  addSellItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
                }
              >
                Add to Sell Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={() => removeOneSell({ type: 'product', data: selectedProduct })}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={sellQuantity} trend={0} />
                <Button
                  size="icon"
                  onClick={() =>
                    addSellItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
                  }
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <div className="bg-card rounded-lg border border-border p-4 flex flex-col gap-4">
            <div className="flex flex-col w-full">
              <h1>{selectedProduct.name}</h1>
              <small>{selectedProduct.mint_name}</small>
            </div>
            <div className="flex w-full justify-between items-center">
              <div className="flex flex-col items-start gap-0">
                <small>Price:</small>
                <h3>
                  <PriceNumberFlow value={price} />
                </h3>
              </div>
              <div className="flex flex-col items-start gap-0">
                <small>Buyback:</small>
                <h3>
                  <PriceNumberFlow value={buybackPrice} />
                </h3>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <AccordionSection
              variant="card"
              label={`Description`}
              open={open.description}
              onToggle={() => setOpen((prev) => ({ ...prev, description: !prev.description }))}
            >
              <p className="text-left whitespace-pre-line">{selectedProduct.description}</p>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Price Breakdown`}
              open={open.price}
              onToggle={() => setOpen((prev) => ({ ...prev, price: !prev.price }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <small>{spot?.name} Ask Spot</small>
                      <p>
                        <PriceNumberFlow value={spot?.ask ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-neutral-700" />
                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {askOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700" />
                      ) : (
                        <Minus size={16} className="text-neutral-700" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Ask Premium</small>
                        <p>
                          <PriceNumberFlow value={Math.abs(askOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <small>Total Ask</small>
                      <strong>
                        <PriceNumberFlow value={price} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Buyback Breakdown`}
              open={open.buyback}
              onToggle={() => setOpen((prev) => ({ ...prev, buyback: !prev.buyback }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <small>{spot?.name} Bid Spot</small>
                      <p>
                        <PriceNumberFlow value={spot?.bid ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-neutral-700" />
                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {bidOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700" />
                      ) : (
                        <Minus size={16} className="text-neutral-700" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Bid Premium</small>
                        <p>
                          <PriceNumberFlow value={Math.abs(bidOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <small>Total Bid</small>
                      <strong>
                        <PriceNumberFlow value={buybackPrice} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Shipping`}
              open={open.shipping}
              onToggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
            >
              <div className="flex flex-col w-full gap-3">
                {Object.entries(salesOrderServiceOptions).map(([serviceType, option]) => (
                  <div key={serviceType} className="flex items-center justify-between w-full">
                    <p>
                      {option.label} {`(${option.time})`}
                    </p>
                    <strong>
                      <PriceNumberFlow value={option.cost} />
                    </strong>
                  </div>
                ))}
                <div className="h-px w-full bg-border" />
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1">
                    <ShieldCheckIcon className="text-primary" size={20} />
                    Every shipment is fully insured.
                  </p>
                  <p className="flex items-center gap-1">
                    <ClockIcon className="text-primary" size={20} />
                    Ships the same day we receive your payment.
                  </p>
                  <p className="flex items-center gap-1">
                    <TagIcon className="text-primary" size={20} />
                    Free shipping for orders over $1000.
                  </p>
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Payment Options`}
              open={open.payment}
              onToggle={() => setOpen((prev) => ({ ...prev, payment: !prev.payment }))}
            >
              <div className="flex flex-col">
                {paymentOptions
                  .filter((payment) => !payment.disabled && payment.display)
                  .map((payment, index) => {

                    const Icon = payment.icon
                    return (
                      <div
                        key={index}
                        className={cn(
                          'flex flex-col items-start gap-1 py-2',
                          index !== 0 && 'border-t border-border'
                        )}
                      >
                        <div className="flex w-full gap-2 items-center">
                          <div className="flex items-center gap-1">
                            <Icon className='text-primary' size={20} />
                            <h5>{payment.label}</h5>
                          </div>
                          <small className="flex items-center gap-2 pt-1 pl-4">
                            <span className="text-left">{payment.time_delay}</span>
                            <CircleIcon size={6} weight="fill" className="text-neutral-500" />
                            <span className="text-right">{payment.surcharge_label}</span>
                          </small>
                        </div>
                        <p>{payment.description}</p>
                      </div>
                    )
                  })}
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Product Specifications`}
              open={open.specs}
              onToggle={() => setOpen((prev) => ({ ...prev, specs: !prev.specs }))}
            >
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center w-full justify-between">
                  <strong>Weight (troy oz):</strong>
                  <p>{selectedProduct.gross.toFixed(4)}</p>
                </div>
                <div className="flex items-center w-full justify-between">
                  <strong>Purity:</strong>
                  <p>{selectedProduct.purity.toFixed(4)}</p>
                </div>
                <div className="flex items-center w-full justify-between">
                  <strong>{selectedProduct.metal_type} Content:</strong>
                  <p>{selectedProduct.content.toFixed(4)}</p>
                </div>
              </div>
            </AccordionSection>
          </div>
        </div>
      </div>

      {/* mobile */}
      <div className="flex flex-col lg:hidden items-center justify-center w-full gap-4 flex-1">
        <div className="bg-card rounded-lg border border-border p-4 flex flex-col gap-4 w-full">
          <div className="flex flex-col w-full">
            <h1>{selectedProduct.name}</h1>
            <small>{selectedProduct.mint_name}</small>
          </div>
          <div className="flex w-full justify-between items-center">
            <div className="flex flex-col items-start gap-0">
              <small>Price:</small>
              <h3>
                <PriceNumberFlow value={price} />
              </h3>
            </div>
            <div className="flex flex-col items-start gap-0">
              <small>Buyback:</small>
              <h3>
                <PriceNumberFlow value={buybackPrice} />
              </h3>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <div className="flex relative aspect-square bg-card border border-border rounded-lg h-full w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full h-full"
              >
                <Lens hovering={hovering} setHovering={setHovering}>
                  <Image
                    src={selectedImage}
                    height={1000}
                    width={1000}
                    className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
                    alt="Selected product view"
                  />
                </Lens>
                <p className="absolute bottom-0 left-1 flex justify-start eyebrow p-2">
                  {selectedImage === selectedProduct.image_front ? 'Obverse' : 'Reverse'}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center w-full gap-3 flex-1">
            <div
              className={cn(
                'w-20 h-20 bg-background rounded-lg cursor-pointer transition-all border',
                selectedImage === selectedProduct.image_front ? 'bg-card border-primary' : 'border-border'
              )}
              onClick={() => setSelectedImage(selectedProduct.image_front)}
            >
              <Image
                src={selectedProduct.image_front}
                height={500}
                width={500}
                className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
                alt="Front thumbnail"
              />
            </div>
            <div
              className={cn(
                'w-20 h-20 bg-background rounded-lg cursor-pointer transition-all border',
                selectedImage === selectedProduct.image_back ? 'bg-card border-primary' : 'border-border'
              )}
              onClick={() => setSelectedImage(selectedProduct.image_back)}
            >
              <Image
                src={selectedProduct.image_back}
                height={500}
                width={500}
                className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none"
                alt="Back thumbnail"
              />
            </div>
          </div>
        </div>

        {variants.length > 0 && (
          <RadioGroup
            value={selectedProduct.name}
            onValueChange={(val) => {
              const variant = variants.find((v) => v.name === val)
              if (variant) setSelectedProduct(variant)
            }}
            options={[...variants].sort((a, b) => b.content - a.content)}
            getValue={(option) => option.name}
            variant="segment"
            className="flex w-full gap-3"
            optionClassName="w-full"
          >
            {(option) => option.variant_label}
          </RadioGroup>
        )}

        {/* cart buttons */}
        <div className="flex flex-col gap-1 w-full">
          <div className="w-full">
            {quantity === 0 ? (
              <Button
                className="w-full"
                onClick={() => {
                  addItem(selectedProduct)
                }}
              >
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={() => {
                    removeOne(selectedProduct)
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} trend={0} />
                <Button
                  size="icon"
                  onClick={() => {
                    addItem(selectedProduct)
                  }}
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
          <div className="w-full">
            {sellQuantity === 0 ? (
              <Button
                className="w-full"
                onClick={() =>
                  addSellItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
                }
              >
                Add to Sell Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={() => removeOneSell({ type: 'product', data: selectedProduct })}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={sellQuantity} trend={0} />
                <Button
                  size="icon"
                  onClick={() =>
                    addSellItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
                  }
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* accordions */}
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-2 w-full">
            <AccordionSection
              variant="card"
              label={`Description`}
              open={open.description}
              onToggle={() => setOpen((prev) => ({ ...prev, description: !prev.description }))}
            >
              <p className="text-left whitespace-pre-line">{selectedProduct.description}</p>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Price Breakdown`}
              open={open.price}
              onToggle={() => setOpen((prev) => ({ ...prev, price: !prev.price }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <small>{spot?.name} Ask Spot</small>
                      <p>
                        <PriceNumberFlow value={spot?.ask ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-neutral-700" />
                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {askOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700" />
                      ) : (
                        <Minus size={16} className="text-neutral-700" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Ask Premium</small>
                        <p>
                          <PriceNumberFlow value={Math.abs(askOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <small>Total Ask</small>
                      <strong>
                        <PriceNumberFlow value={price} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Buyback Breakdown`}
              open={open.buyback}
              onToggle={() => setOpen((prev) => ({ ...prev, buyback: !prev.buyback }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <small>{spot?.name} Bid Spot</small>
                      <p>
                        <PriceNumberFlow value={spot?.bid ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-neutral-700" />
                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {bidOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700" />
                      ) : (
                        <Minus size={16} className="text-neutral-700" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <small>Bid Premium</small>
                        <p>
                          <PriceNumberFlow value={Math.abs(bidOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <small>Total Bid</small>
                      <strong>
                        <PriceNumberFlow value={buybackPrice} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Shipping`}
              open={open.shipping}
              onToggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
            >
              <div className="flex flex-col w-full gap-3">
                {Object.entries(salesOrderServiceOptions).map(([serviceType, option]) => (
                  <div key={serviceType} className="flex items-center justify-between w-full">
                    <p>
                      {option.label} {`(${option.time})`}
                    </p>
                    <strong>
                      <PriceNumberFlow value={option.cost} />
                    </strong>
                  </div>
                ))}
                <div className="h-px w-full bg-border" />
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1">
                    <ShieldCheckIcon className="text-primary" size={20} />
                    Every shipment is fully insured.
                  </p>
                  <p className="flex items-center gap-1">
                    <ClockIcon className="text-primary" size={20} />
                    Ships the same day we receive your payment.
                  </p>
                  <p className="flex items-center gap-1">
                    <TagIcon className="text-primary" size={20} />
                    Free shipping for orders over $1000.
                  </p>
                </div>
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Payment Options`}
              open={open.payment}
              onToggle={() => setOpen((prev) => ({ ...prev, payment: !prev.payment }))}
            >
              <div className="flex flex-col">
                {paymentOptions
                  .filter((payment) => !payment.disabled && payment.display)
                  .map((payment, index) => {
                    const Icon = payment.icon
                    return (
                      <div
                        key={index}
                        className={cn(
                          'flex flex-col items-start gap-1 py-2',
                          index !== paymentOptions.length - 1
                            ? 'border-b border-border pt-0'
                            : 'pb-0'
                        )}
                      >
                        <div className="flex w-full gap-2 items-center">
                          <div className="flex items-center gap-1">
                            <Icon className='text-primary' size={20} />
                            <h5>{payment.label}</h5>
                          </div>
                          <small className="flex items-center gap-2 pt-1 pl-4">
                            <span className="text-left">{payment.time_delay}</span>
                            <CircleIcon size={6} weight="fill" className="text-neutral-500" />
                            <span className="text-right">{payment.surcharge_label}</span>
                          </small>
                        </div>
                        <p>{payment.description}</p>
                      </div>
                    )
                  })}
              </div>
            </AccordionSection>
            <AccordionSection
              variant="card"
              label={`Product Specifications`}
              open={open.specs}
              onToggle={() => setOpen((prev) => ({ ...prev, specs: !prev.specs }))}
            >
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center w-full justify-between">
                  <strong>Weight (troy oz):</strong>
                  <p>{selectedProduct.gross.toFixed(4)}</p>
                </div>
                <div className="flex items-center w-full justify-between">
                  <strong>Purity:</strong>
                  <p>{selectedProduct.purity.toFixed(4)}</p>
                </div>
                <div className="flex items-center w-full justify-between">
                  <strong>{selectedProduct.metal_type} Content:</strong>
                  <p>{selectedProduct.content.toFixed(4)}</p>
                </div>
              </div>
            </AccordionSection>
          </div>
        </div>
      </div>
    </div>
  )
}
