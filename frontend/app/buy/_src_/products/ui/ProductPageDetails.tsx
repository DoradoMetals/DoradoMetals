'use client'

import Image from 'next/image'
import { Product } from '@/shared/types/products'
import { Accordion, Amount, Button, RadioGroup, RadioOption } from '@dorado/components'
import { Circle, Clock, Equal, Minus, Plus, ShieldCheck, Tag, X } from '@dorado/icons'
import NumberFlow from '@number-flow/react'

import { useState } from 'react'

import { cn } from '@/shared/utils/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { useBasket, useCheckoutItemActions } from '@/shared/hooks/checkout/items/queries'
import { paymentMethodIcon, transitLabel } from '@/shared/types/salesOrders'
import { usePaymentMethods, useSaleShippingServices } from '@dorado/client'
import { useSpotPrices } from '@dorado/client'
import { useProductQuote } from '@/shared/hooks/quotes/queries'

type ProductPageProps = {
  product: Product
  variants: Product[]
}

export default function ProductPageDetails({ product, variants }: ProductPageProps) {
  // Reference rows (D207/D208): the sale delivery services and payment
  // methods these accordions print, public like the page itself.
  const { data: saleServices = [] } = useSaleShippingServices()
  const displayServices = saleServices.filter((s) => s.display)
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const displayMethods = saleMethods.filter((m) => m.enabled && m.display)
  // The server picks the family's headline row and orders the siblings
  // (heaviest first), so there is nothing to sort here.
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const [selectedImage, setSelectedImage] = useState<string>(product.image_front)

  const [open, setOpen] = useState({
    description: false,
    price: false,
    buyback: false,
    shipping: false,
    payment: false,
    specs: false,
  })

  const buyItems = useBasket('sale')
  const sellItems = useBasket('purchase')
  const { addItem, removeOne } = useCheckoutItemActions()

  const buyRow = buyItems.find((i) => i.bullion_id === selectedProduct.id)
  const sellRow = sellItems.find((i) => i.bullion_id === selectedProduct.id)
  const quantity = buyRow?.quantity ?? 0
  const sellQuantity = sellRow?.quantity ?? 0

  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.id === selectedProduct.metal_id)

  // The page's own single-item quotes, one per side, re-quoted when the
  // selected variant changes. Ask is gated on `display` (already true - the
  // slug read itself filters it). The sell side has no gate at all (Jacob,
  // 2026-09-03, ruling 49), so the bid quote is always requested.
  const { data: askQuote } = useProductQuote(selectedProduct.id, 'ask')
  const { data: bidQuote } = useProductQuote(selectedProduct.id, 'bid')

  const price = askQuote?.unit_price ?? 0
  const buybackPrice = bidQuote?.unit_price ?? 0

  // OVER OR UNDER SPOT IS EACH QUOTE'S OWN `premium` - the number the server
  // priced from, rather than a subtraction against a ticker read seconds apart.
  const askOverOrUnder = askQuote?.premium ?? 0
  const bidOverOrUnder = bidQuote?.premium ?? 0

  return (
    <div>
      <div className="hidden lg:flex items-start w-5xl flex-1 gap-4">
        <RadioGroup
          value={selectedImage}
          onValueChange={setSelectedImage}
          aria-label="Product images"
          className="flex flex-col gap-3"
        >
          {[selectedProduct.image_front, selectedProduct.image_back].map((src) => (
            <RadioOption key={src} value={src} variant="tile" className="h-20 w-20 p-0">
              <Image
                src={src}
                height={500}
                width={500}
                className="pointer-events-none h-full w-full object-contain"
                alt={src === selectedProduct.image_front ? 'Front thumbnail' : 'Back thumbnail'}
              />
            </RadioOption>
          ))}
        </RadioGroup>
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
              className="flex w-full gap-3"
            >
              {variants.map((option) => (
                <RadioOption
                  key={option.id}
                  value={option.name}
                  variant="segment"
                  className="w-full"
                >
                  {option.variant_label}
                </RadioOption>
              ))}
            </RadioGroup>
          )}
          <div className="w-full">
            {quantity === 0 ? (
              <Button
                className="w-full"
                onClick={() => {
                  addItem('sale', { bullion_id: selectedProduct.id, quantity: 1 })
                }}
              >
                Add to Checkout
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={() => {
                    buyRow && removeOne('sale', buyRow)
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} trend={0} />
                <Button
                  size="icon"
                  onClick={() => {
                    addItem('sale', { bullion_id: selectedProduct.id, quantity: 1 })
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
                onClick={() => addItem('purchase', { bullion_id: selectedProduct.id, quantity: 1 })}
              >
                Sell to Us
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button size="icon" onClick={() => sellRow && removeOne('purchase', sellRow)}>
                  <Minus size={20} />
                </Button>
                <NumberFlow value={sellQuantity} trend={0} />
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
        <div className="flex flex-col gap-2 w-full">
          <div className="bg-card rounded-lg border border-border p-4 flex flex-col gap-4">
            <div className="flex flex-col w-full">
              <h1>{selectedProduct.name}</h1>
              <small>{selectedProduct.mint_name}</small>
            </div>
            <div className="flex w-full justify-between items-center">
              <div className="flex flex-col items-start gap-0">
                <small>Price:</small>
                <strong className="stat-sm">
                  <Amount value={price} />
                </strong>
              </div>
              <div className="flex flex-col items-start gap-0">
                <small>Buyback:</small>
                <strong className="stat-sm">
                  <Amount value={buybackPrice} />
                </strong>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <Accordion
              surface="card"
              label={`Description`}
              open={open.description}
              onToggle={() => setOpen((prev) => ({ ...prev, description: !prev.description }))}
            >
              <p className="text-left whitespace-pre-line">{selectedProduct.description}</p>
            </Accordion>
            <Accordion
              surface="card"
              label={`Price Breakdown`}
              open={open.price}
              onToggle={() => setOpen((prev) => ({ ...prev, price: !prev.price }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-8'
                      )}
                    >
                      <small>{selectedProduct.metal_id} Ask Spot</small>
                      <p>
                        <Amount value={spot?.ask ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-subtle" />
                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {askOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-subtle" />
                      ) : (
                        <Minus size={16} className="text-subtle" />
                      )}

                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Ask Premium</small>
                        <p>
                          <Amount value={Math.abs(askOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-subtle" />
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-4'
                      )}
                    >
                      <small>Total Ask</small>
                      <strong>
                        <Amount value={price} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              surface="card"
              label={`Buyback Breakdown`}
              open={open.buyback}
              onToggle={() => setOpen((prev) => ({ ...prev, buyback: !prev.buyback }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-8'
                      )}
                    >
                      <small>{selectedProduct.metal_id} Bid Spot</small>
                      <p>
                        <Amount value={spot?.bid ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-subtle" />
                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {bidOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-subtle" />
                      ) : (
                        <Minus size={16} className="text-subtle" />
                      )}

                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Bid Premium</small>
                        <p>
                          <Amount value={Math.abs(bidOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-subtle" />
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-4'
                      )}
                    >
                      <small>Total Bid</small>
                      <strong>
                        <Amount value={buybackPrice} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              surface="card"
              label={`Shipping`}
              open={open.shipping}
              onToggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
            >
              <div className="flex flex-col w-full gap-3">
                {displayServices.map((svc) => (
                  <div
                    key={svc.code ?? svc.id}
                    className="flex items-center justify-between w-full"
                  >
                    <p>
                      {svc.name} {`(${transitLabel(svc.min_transit_days, svc.max_transit_days)})`}
                    </p>
                    <strong>
                      <Amount value={Number(svc.price ?? 0)} />
                    </strong>
                  </div>
                ))}
                <div className="h-px w-full bg-border" />
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1">
                    <ShieldCheck className="text-primary" size={20} />
                    Every shipment is fully insured.
                  </p>
                  <p className="flex items-center gap-1">
                    <Clock className="text-primary" size={20} />
                    Ships the same day we receive your payment.
                  </p>
                  <p className="flex items-center gap-1">
                    <Tag className="text-primary" size={20} />
                    Free shipping for orders over $1000.
                  </p>
                </div>
              </div>
            </Accordion>
            <Accordion
              surface="card"
              label={`Payment Options`}
              open={open.payment}
              onToggle={() => setOpen((prev) => ({ ...prev, payment: !prev.payment }))}
            >
              <div className="flex flex-col">
                {displayMethods.map((payment, index) => {
                  const Icon = paymentMethodIcon[payment.type as keyof typeof paymentMethodIcon]
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
                          {Icon && <Icon className="text-primary" size={20} />}
                          <h5>{payment.label}</h5>
                        </div>
                        <small className="flex items-center gap-2 pt-1 pl-4">
                          <span className="text-left">{payment.time_delay}</span>
                          <Circle size={6} className="text-placeholder" />
                          <span className="text-right">{payment.surcharge_label}</span>
                        </small>
                      </div>
                      <p>{payment.short_description}</p>
                    </div>
                  )
                })}
              </div>
            </Accordion>
            <Accordion
              surface="card"
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
                  <strong>{selectedProduct.metal_id} Content:</strong>
                  <p>{selectedProduct.content.toFixed(4)}</p>
                </div>
              </div>
            </Accordion>
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
              <strong className="stat-sm">
                <Amount value={price} />
              </strong>
            </div>
            <div className="flex flex-col items-start gap-0">
              <small>Buyback:</small>
              <strong className="stat-sm">
                <Amount value={buybackPrice} />
              </strong>
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
              </motion.div>
            </AnimatePresence>
          </div>
          <RadioGroup
            value={selectedImage}
            onValueChange={setSelectedImage}
            aria-label="Product images"
            className="flex items-center w-full gap-3 flex-1"
          >
            {[selectedProduct.image_front, selectedProduct.image_back].map((src) => (
              <RadioOption key={src} value={src} variant="tile" className="h-20 w-20 p-0">
                <Image
                  src={src}
                  height={500}
                  width={500}
                  className="pointer-events-none h-full w-full object-contain"
                  alt={src === selectedProduct.image_front ? 'Front thumbnail' : 'Back thumbnail'}
                />
              </RadioOption>
            ))}
          </RadioGroup>
        </div>

        {variants.length > 0 && (
          <RadioGroup
            value={selectedProduct.name}
            onValueChange={(val) => {
              const variant = variants.find((v) => v.name === val)
              if (variant) setSelectedProduct(variant)
            }}
            className="flex w-full gap-3"
          >
            {variants.map((option) => (
              <RadioOption key={option.id} value={option.name} variant="segment" className="w-full">
                {option.variant_label}
              </RadioOption>
            ))}
          </RadioGroup>
        )}

        {/* basket buttons */}
        <div className="flex flex-col gap-1 w-full">
          <div className="w-full">
            {quantity === 0 ? (
              <Button
                className="w-full"
                onClick={() => {
                  addItem('sale', { bullion_id: selectedProduct.id, quantity: 1 })
                }}
              >
                Add to Checkout
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button
                  size="icon"
                  onClick={() => {
                    buyRow && removeOne('sale', buyRow)
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} trend={0} />
                <Button
                  size="icon"
                  onClick={() => {
                    addItem('sale', { bullion_id: selectedProduct.id, quantity: 1 })
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
                onClick={() => addItem('purchase', { bullion_id: selectedProduct.id, quantity: 1 })}
              >
                Sell to Us
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <Button size="icon" onClick={() => sellRow && removeOne('purchase', sellRow)}>
                  <Minus size={20} />
                </Button>
                <NumberFlow value={sellQuantity} trend={0} />
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

        {/* accordions */}
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-2 w-full">
            <Accordion
              surface="card"
              label={`Description`}
              open={open.description}
              onToggle={() => setOpen((prev) => ({ ...prev, description: !prev.description }))}
            >
              <p className="text-left whitespace-pre-line">{selectedProduct.description}</p>
            </Accordion>
            <Accordion
              surface="card"
              label={`Price Breakdown`}
              open={open.price}
              onToggle={() => setOpen((prev) => ({ ...prev, price: !prev.price }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-8'
                      )}
                    >
                      <small>{selectedProduct.metal_id} Ask Spot</small>
                      <p>
                        <Amount value={spot?.ask ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-subtle" />
                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {askOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-subtle" />
                      ) : (
                        <Minus size={16} className="text-subtle" />
                      )}

                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Ask Premium</small>
                        <p>
                          <Amount value={Math.abs(askOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-subtle" />
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-4'
                      )}
                    >
                      <small>Total Ask</small>
                      <strong>
                        <Amount value={price} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              surface="card"
              label={`Buyback Breakdown`}
              open={open.buyback}
              onToggle={() => setOpen((prev) => ({ ...prev, buyback: !prev.buyback }))}
            >
              <div className="text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-8'
                      )}
                    >
                      <small>{selectedProduct.metal_id} Bid Spot</small>
                      <p>
                        <Amount value={spot?.bid ?? 0} />
                      </p>
                    </div>

                    <div className="flex w-full items-start">
                      <X size={16} className="text-subtle" />
                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Content (oz)</small>
                        <p>{selectedProduct.content}</p>
                      </div>
                    </div>

                    <div className="flex w-full items-start">
                      {bidOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-subtle" />
                      ) : (
                        <Minus size={16} className="text-subtle" />
                      )}

                      <div
                        className={cn(
                          'flex w-full items-center justify-between gap-2',
                          'items-start pl-4'
                        )}
                      >
                        <small>Bid Premium</small>
                        <p>
                          <Amount value={Math.abs(bidOverOrUnder)} />
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-subtle" />
                    <div
                      className={cn(
                        'flex w-full items-center justify-between gap-2',
                        'items-start pl-4'
                      )}
                    >
                      <small>Total Bid</small>
                      <strong>
                        <Amount value={buybackPrice} />
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              surface="card"
              label={`Shipping`}
              open={open.shipping}
              onToggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
            >
              <div className="flex flex-col w-full gap-3">
                {displayServices.map((svc) => (
                  <div
                    key={svc.code ?? svc.id}
                    className="flex items-center justify-between w-full"
                  >
                    <p>
                      {svc.name} {`(${transitLabel(svc.min_transit_days, svc.max_transit_days)})`}
                    </p>
                    <strong>
                      <Amount value={Number(svc.price ?? 0)} />
                    </strong>
                  </div>
                ))}
                <div className="h-px w-full bg-border" />
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-1">
                    <ShieldCheck className="text-primary" size={20} />
                    Every shipment is fully insured.
                  </p>
                  <p className="flex items-center gap-1">
                    <Clock className="text-primary" size={20} />
                    Ships the same day we receive your payment.
                  </p>
                  <p className="flex items-center gap-1">
                    <Tag className="text-primary" size={20} />
                    Free shipping for orders over $1000.
                  </p>
                </div>
              </div>
            </Accordion>
            <Accordion
              surface="card"
              label={`Payment Options`}
              open={open.payment}
              onToggle={() => setOpen((prev) => ({ ...prev, payment: !prev.payment }))}
            >
              <div className="flex flex-col">
                {displayMethods.map((payment, index) => {
                  const Icon = paymentMethodIcon[payment.type as keyof typeof paymentMethodIcon]
                  return (
                    <div
                      key={index}
                      className={cn(
                        'flex flex-col items-start gap-1 py-2',
                        index !== displayMethods.length - 1 ? 'border-b border-border pt-0' : 'pb-0'
                      )}
                    >
                      <div className="flex w-full gap-2 items-center">
                        <div className="flex items-center gap-1">
                          {Icon && <Icon className="text-primary" size={20} />}
                          <h5>{payment.label}</h5>
                        </div>
                        <small className="flex items-center gap-2 pt-1 pl-4">
                          <span className="text-left">{payment.time_delay}</span>
                          <Circle size={6} className="text-placeholder" />
                          <span className="text-right">{payment.surcharge_label}</span>
                        </small>
                      </div>
                      <p>{payment.short_description}</p>
                    </div>
                  )
                })}
              </div>
            </Accordion>
            <Accordion
              surface="card"
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
                  <strong>{selectedProduct.metal_id} Content:</strong>
                  <p>{selectedProduct.content.toFixed(4)}</p>
                </div>
              </div>
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  )
}
