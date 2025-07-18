'use client'

import Image from 'next/image'
import { Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { ChevronDown, Equal, Minus, Plus, X } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { useMemo, useState } from 'react'
import { cartStore } from '@/store/cartStore'
import PriceNumberFlow from './PriceNumberFlow'
import getProductPrice from '@/utils/getProductPrice'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getProductBidPrice from '@/utils/getProductBidPrice'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import getProductAskOverUnderSpot from '@/utils/getProductAskOverUnderSpot'
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  TagIcon,
} from '@phosphor-icons/react'
import { sellCartStore } from '@/store/sellCartStore'
import { Lens } from '@/components/ui/lens'
import { paymentOptions, salesOrderServiceOptions } from '@/types/sales-orders'
import getPrimaryIconStroke, { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'
import getProductBidOverUnderSpot from '@/utils/getProductBidOverUnderSpot'

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
  const cartItem = items.find((item) => item.product_name === selectedProduct.product_name)
  const quantity = cartItem?.quantity ?? 0

  const sellItems = sellCartStore((state) => state.items)
  const addSellItem = sellCartStore((state) => state.addItem)
  const removeOneSell = sellCartStore((state) => state.removeOne)
  const sellCartItem = sellItems.find(
    (item) =>
      item.type === 'product' &&
      (item.data as Product).product_name === selectedProduct.product_name
  )
  const sellQuantity = sellCartItem?.data.quantity ?? 0

  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.type === product.metal_type)

  const askOverOrUnder = getProductAskOverUnderSpot(selectedProduct, spot)
  const bidOverOrUnder = getProductBidOverUnderSpot(selectedProduct, spot)

  const price = useMemo(() => {
    return getProductPrice(selectedProduct, spot)
  }, [spot, selectedProduct])

  const buybackPrice = useMemo(() => {
    return getProductBidPrice(selectedProduct, spot)
  }, [spot, selectedProduct])

  return (
    <div>
      <div className="hidden lg:flex items-start w-5xl flex-1 gap-4">
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              'w-20 h-20 bg-background raised-off-page rounded-lg cursor-pointer transition-all',
              selectedImage === selectedProduct.image_front && 'bg-card'
            )}
            onClick={() => setSelectedImage(selectedProduct.image_front)}
          >
            <Image
              src={selectedProduct.image_front}
              height={500}
              width={500}
              className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
              alt="Front thumbnail"
            />
          </div>
          <div
            className={cn(
              'w-20 h-20 bg-background raised-off-page rounded-lg cursor-pointer transition-all',
              selectedImage === selectedProduct.image_back && 'bg-card'
            )}
            onClick={() => setSelectedImage(selectedProduct.image_back)}
          >
            <Image
              src={selectedProduct.image_back}
              height={500}
              width={500}
              className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
              alt="Back thumbnail"
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full h-full">
          <div className="flex relative aspect-square bg-card raised-off-page rounded-lg h-full w-full">
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
                    className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                    alt="Selected product view"
                  />
                  <div className="absolute bottom-0 left-1 flex justify-start section-label p-2">
                    {selectedImage === selectedProduct.image_front ? 'Obverse' : 'Reverse'}
                  </div>
                </Lens>
              </motion.div>
            </AnimatePresence>
          </div>
          {variants.length > 0 && (
            <RadioGroup
              value={selectedProduct.product_name}
              onValueChange={(val) => {
                const variant = variants.find((v) => v.product_name === val)
                if (variant) setSelectedProduct(variant)
              }}
              className="gap-3 w-full flex"
            >
              {[...variants]
                .sort((a, b) => b.content - a.content)
                .map((option) => {
                  const isSelected = option.product_name === selectedProduct.product_name
                  return (
                    <motion.label
                      key={option.id}
                      initial={false}
                      animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                      className={cn(
                        'relative flex w-full justify-center rounded-md px-3 py-2 font-normal cursor-pointer raised-off-page',
                        isSelected
                          ? ' liquid-gold text-white hover:text-white'
                          : 'bg-card text-neutral-800'
                      )}
                    >
                      <div className="absolute top-1 right-1">
                        <CheckCircleIcon
                          size={16}
                          className={cn(
                            'transition-opacity duration-200 text-white',
                            isSelected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-sm">{option.variant_label}</div>
                      </div>
                      <RadioGroupItem
                        id={option.product_name}
                        value={option.product_name}
                        className="sr-only"
                      />
                    </motion.label>
                  )
                })}
            </RadioGroup>
          )}
          <div
            className={cn(
              'cursor-default secondary-gradient raised-off-page w-full rounded-lg py-1 text-white',
              quantity === 0 ? 'shine-on-hover' : ''
            )}
          >
            {quantity === 0 ? (
              <Button
                variant="ghost"
                className="bg-transparent w-full hover:bg-transparent text-white hover:text-white text-base"
                onClick={() => {
                  addItem(selectedProduct)
                }}
              >
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => {
                    removeOne(selectedProduct)
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow
                  value={quantity}
                  className="text-white text-lg font-semibold"
                  trend={0}
                />
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => {
                    addItem(selectedProduct)
                  }}
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
          <div
            className={cn(
              'cursor-default liquid-gold raised-off-page w-full rounded-lg py-1 text-white',
              sellQuantity === 0 ? 'shine-on-hover' : ''
            )}
          >
            {sellQuantity === 0 ? (
              <Button
                variant="ghost"
                className="bg-transparent w-full hover:bg-transparent text-white hover:text-white text-base"
                onClick={() =>
                  addSellItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
                }
              >
                Add to Sell Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => removeOneSell({ type: 'product', data: selectedProduct })}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow
                  value={sellQuantity}
                  className="text-white text-lg font-semibold"
                  trend={0}
                />
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
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
          <div className="bg-card rounded-lg raised-off-page p-4 flex flex-col gap-4">
            <div className="flex flex-col w-full">
              <h1 className="text-2xl text-neutral-800">{selectedProduct.product_name}</h1>
              <div className="text-sm text-neutral-700">{selectedProduct.mint_name}</div>
            </div>
            <div className="flex w-full justify-between items-center">
              <div className="flex flex-col items-start gap-0">
                <div className="text-sm text-neutral-700">Price:</div>
                <div className="text-xl text-neutral-800">
                  <PriceNumberFlow value={price} />
                </div>
              </div>
              <div className="flex flex-col items-start gap-0">
                <div className="text-sm text-neutral-700">Buyback:</div>
                <div className="text-xl text-neutral-800">
                  <PriceNumberFlow value={buybackPrice} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <Accordion
              label={`Description`}
              open={open.description}
              toggle={() => setOpen((prev) => ({ ...prev, description: !prev.description }))}
            >
              <div className="text-sm text-left whitespace-pre-line">
                {selectedProduct.product_description}
              </div>
            </Accordion>
            <Accordion
              label={`Price Breakdown`}
              open={open.price}
              toggle={() => setOpen((prev) => ({ ...prev, price: !prev.price }))}
            >
              <div className="text-sm text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <div className="text-xs text-neutral-600">{spot?.type} Ask Spot</div>
                      <div className="text-sm">
                        <PriceNumberFlow value={spot?.ask_spot ?? 0} />
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
                      {askOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700 px-0" />
                      ) : (
                        <Minus size={16} className="text-neutral-700 px-0" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <div className="text-xs text-neutral-600">Ask Premium</div>
                        <div className="text-sm">
                          <PriceNumberFlow value={Math.abs(askOverOrUnder)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700 px-0" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <div className="text-xs text-neutral-600">Total Ask</div>
                      <div className="text-sm text-neutral-900">
                        <PriceNumberFlow value={price} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              label={`Buyback Breakdown`}
              open={open.buyback}
              toggle={() => setOpen((prev) => ({ ...prev, buyback: !prev.buyback }))}
            >
              <div className="text-sm text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <div className="text-xs text-neutral-600">{spot?.type} Bid Spot</div>
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
                      {bidOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700 px-0" />
                      ) : (
                        <Minus size={16} className="text-neutral-700 px-0" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <div className="text-xs text-neutral-600">Bid Premium</div>
                        <div className="text-sm">
                          <PriceNumberFlow value={Math.abs(bidOverOrUnder)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700 px-0" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <div className="text-xs text-neutral-600">Total Bid</div>
                      <div className="text-sm text-neutral-900">
                        <PriceNumberFlow value={buybackPrice} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              label={`Shipping`}
              open={open.shipping}
              toggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
            >
              <div className="flex flex-col w-full gap-3">
                {Object.entries(salesOrderServiceOptions).map(([serviceType, option]) => (
                  <div key={serviceType} className="flex items-center justify-between w-full">
                    <div className="text-sm text-neutral-600">
                      {option.label} {`(${option.time})`}
                    </div>
                    <div className="text-base text-neutral-800">
                      <PriceNumberFlow value={option.cost} />
                    </div>
                  </div>
                ))}
                <div className="separator-inset" />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1 text-sm text-neutral-600">
                    <ShieldCheckIcon color={getPrimaryIconStroke()} size={20} />
                    Every shipment is fully insured.
                  </div>
                  <div className="flex items-center gap-1 text-sm text-neutral-600">
                    <ClockIcon color={getPrimaryIconStroke()} size={20} />
                    Ships the same day we receive your payment.
                  </div>
                  <div className="flex items-center gap-1 text-sm text-neutral-600">
                    <TagIcon color={getPrimaryIconStroke()} size={20} />
                    Free shipping for orders over $1000.
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              label={`Payment Options`}
              open={open.payment}
              toggle={() => setOpen((prev) => ({ ...prev, payment: !prev.payment }))}
            >
              <div className="flex flex-col">
                {paymentOptions
                  .filter((payment) => !payment.disabled)
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
                            <Icon color={getPrimaryIconStroke()} size={20} />
                            <div className="text-base text-neutral-800">{payment.label}</div>
                          </div>
                          <div className="text-neutral-600 text-xs flex items-center gap-2 pt-1 pl-4">
                            <span className="text-left">{payment.time_delay}</span>
                            <CircleIcon size={6} weight="fill" className="text-neutral-300" />
                            <span className="text-right">{payment.subcharge}</span>
                          </div>
                        </div>
                        <div className="text-sm text-neutral-600">{payment.description}</div>
                      </div>
                    )
                  })}
              </div>
            </Accordion>
            <Accordion
              label={`Product Specifications`}
              open={open.specs}
              toggle={() => setOpen((prev) => ({ ...prev, specs: !prev.specs }))}
            >
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center w-full justify-between">
                  <div className="text-sm text-neutral-800">Weight (troy oz):</div>
                  <div className="text-sm text-neutral-600">{selectedProduct.gross.toFixed(4)}</div>
                </div>
                <div className="flex items-center w-full justify-between">
                  <div className="text-sm text-neutral-800">Purity:</div>
                  <div className="text-sm text-neutral-600">
                    {selectedProduct.purity.toFixed(4)}
                  </div>
                </div>
                <div className="flex items-center w-full justify-between">
                  <div className="text-sm text-neutral-800">
                    {selectedProduct.metal_type} Content:
                  </div>
                  <div className="text-sm text-neutral-600">
                    {selectedProduct.content.toFixed(4)}
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        </div>
      </div>

      {/* mobile */}
      <div className="flex flex-col lg:hidden items-center justify-center w-full gap-4 flex-1">
        <div className="bg-card rounded-lg raised-off-page p-4 flex flex-col gap-4 w-full">
          <div className="flex flex-col w-full">
            <h1 className="text-2xl text-neutral-800">{selectedProduct.product_name}</h1>
            <div className="text-sm text-neutral-700">{selectedProduct.mint_name}</div>
          </div>
          <div className="flex w-full justify-between items-center">
            <div className="flex flex-col items-start gap-0">
              <div className="text-sm text-neutral-700">Price:</div>
              <div className="text-xl text-neutral-800">
                <PriceNumberFlow value={price} />
              </div>
            </div>
            <div className="flex flex-col items-start gap-0">
              <div className="text-sm text-neutral-700">Buyback:</div>
              <div className="text-xl text-neutral-800">
                <PriceNumberFlow value={buybackPrice} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <div className="flex relative aspect-square bg-card raised-off-page rounded-lg h-full w-full">
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
                    className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                    alt="Selected product view"
                  />
                </Lens>
                <div className="absolute bottom-0 left-1 flex justify-start section-label p-2">
                  {selectedImage === selectedProduct.image_front ? 'Obverse' : 'Reverse'}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center w-full gap-3 flex-1">
            <div
              className={cn(
                'w-20 h-20 bg-background raised-off-page rounded-lg cursor-pointer transition-all',
                selectedImage === selectedProduct.image_front && 'bg-card'
              )}
              onClick={() => setSelectedImage(selectedProduct.image_front)}
            >
              <Image
                src={selectedProduct.image_front}
                height={500}
                width={500}
                className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                alt="Front thumbnail"
              />
            </div>
            <div
              className={cn(
                'w-20 h-20 bg-background raised-off-page rounded-lg cursor-pointer transition-all',
                selectedImage === selectedProduct.image_back && 'bg-card'
              )}
              onClick={() => setSelectedImage(selectedProduct.image_back)}
            >
              <Image
                src={selectedProduct.image_back}
                height={500}
                width={500}
                className="relative z-20 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                alt="Back thumbnail"
              />
            </div>
          </div>
        </div>

        {variants.length > 0 && (
          <RadioGroup
            value={selectedProduct.product_name}
            onValueChange={(val) => {
              const variant = variants.find((v) => v.product_name === val)
              if (variant) setSelectedProduct(variant)
            }}
            className="gap-3 w-full flex"
          >
            {[...variants]
              .sort((a, b) => b.content - a.content)
              .map((option) => {
                const isSelected = option.product_name === selectedProduct.product_name
                return (
                  <motion.label
                    key={option.id}
                    initial={false}
                    animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                    className={cn(
                      'relative flex w-full justify-center rounded-md px-3 py-2 font-normal cursor-pointer raised-off-page',
                      isSelected
                        ? ' liquid-gold text-white hover:text-white'
                        : 'bg-card text-neutral-800'
                    )}
                  >
                    <div className="absolute top-1 right-1">
                      <CheckCircleIcon
                        size={16}
                        className={cn(
                          'transition-opacity duration-200 text-white',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-sm">{option.variant_label}</div>
                    </div>
                    <RadioGroupItem
                      id={option.product_name}
                      value={option.product_name}
                      className="sr-only"
                    />
                  </motion.label>
                )
              })}
          </RadioGroup>
        )}

        {/* cart buttons */}
        <div className="flex flex-col gap-1 w-full">
          <div
            className={cn(
              'cursor-default secondary-gradient raised-off-page w-full rounded-lg py-1 text-white',
              quantity === 0 ? 'shine-on-hover' : ''
            )}
          >
            {quantity === 0 ? (
              <Button
                variant="ghost"
                className="bg-transparent w-full hover:bg-transparent text-white hover:text-white"
                onClick={() => {
                  addItem(selectedProduct)
                }}
              >
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => {
                    removeOne(selectedProduct)
                  }}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow
                  value={quantity}
                  className="text-white text-lg font-semibold"
                  trend={0}
                />
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => {
                    addItem(selectedProduct)
                  }}
                >
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
          <div
            className={cn(
              'cursor-default liquid-gold raised-off-page w-full rounded-lg py-1 text-white',
              sellQuantity === 0 ? 'shine-on-hover' : ''
            )}
          >
            {sellQuantity === 0 ? (
              <Button
                variant="ghost"
                className="bg-transparent w-full hover:bg-transparent text-white hover:text-white"
                onClick={() =>
                  addSellItem({ type: 'product', data: { ...selectedProduct, quantity: 1 } })
                }
              >
                Add to Sell Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => removeOneSell({ type: 'product', data: selectedProduct })}
                >
                  <Minus size={20} />
                </Button>
                <NumberFlow
                  value={sellQuantity}
                  className="text-white text-lg font-semibold"
                  trend={0}
                />
                <Button
                  variant="ghost"
                  className="text-white hover:text-white"
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
            <Accordion
              label={`Description`}
              open={open.description}
              toggle={() => setOpen((prev) => ({ ...prev, description: !prev.description }))}
            >
              <div className="text-sm text-left whitespace-pre-line">
                {selectedProduct.product_description}
              </div>
            </Accordion>
            <Accordion
              label={`Price Breakdown`}
              open={open.price}
              toggle={() => setOpen((prev) => ({ ...prev, price: !prev.price }))}
            >
              <div className="text-sm text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <div className="text-xs text-neutral-600">{spot?.type} Ask Spot</div>
                      <div className="text-sm">
                        <PriceNumberFlow value={spot?.ask_spot ?? 0} />
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
                      {askOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700 px-0" />
                      ) : (
                        <Minus size={16} className="text-neutral-700 px-0" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <div className="text-xs text-neutral-600">Ask Premium</div>
                        <div className="text-sm">
                          <PriceNumberFlow value={Math.abs(askOverOrUnder)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700 px-0" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <div className="text-xs text-neutral-600">Total Ask</div>
                      <div className="text-sm text-neutral-900">
                        <PriceNumberFlow value={price} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              label={`Buyback Breakdown`}
              open={open.buyback}
              toggle={() => setOpen((prev) => ({ ...prev, buyback: !prev.buyback }))}
            >
              <div className="text-sm text-left">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                    <div className="flex w-full items-start justify-between pl-8">
                      <div className="text-xs text-neutral-600">{spot?.type} Bid Spot</div>
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
                      {bidOverOrUnder >= 0 ? (
                        <Plus size={16} className="text-neutral-700 px-0" />
                      ) : (
                        <Minus size={16} className="text-neutral-700 px-0" />
                      )}

                      <div className="flex w-full items-start justify-between pl-4">
                        <div className="text-xs text-neutral-600">Bid Premium</div>
                        <div className="text-sm">
                          <PriceNumberFlow value={Math.abs(bidOverOrUnder)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full items-start">
                    <Equal size={16} className="text-neutral-700 px-0" />
                    <div className="flex w-full items-start justify-between pl-4">
                      <div className="text-xs text-neutral-600">Total Bid</div>
                      <div className="text-sm text-neutral-900">
                        <PriceNumberFlow value={buybackPrice} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              label={`Shipping`}
              open={open.shipping}
              toggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
            >
              <div className="flex flex-col w-full gap-3">
                {Object.entries(salesOrderServiceOptions).map(([serviceType, option]) => (
                  <div key={serviceType} className="flex items-center justify-between w-full">
                    <div className="text-sm text-neutral-600">
                      {option.label} {`(${option.time})`}
                    </div>
                    <div className="text-base text-neutral-800">
                      <PriceNumberFlow value={option.cost} />
                    </div>
                  </div>
                ))}
                <div className="separator-inset" />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1 text-sm text-neutral-600">
                    <ShieldCheckIcon color={getPrimaryIconStroke()} size={20} />
                    Every shipment is fully insured.
                  </div>
                  <div className="flex items-center gap-1 text-sm text-neutral-600">
                    <ClockIcon color={getPrimaryIconStroke()} size={20} />
                    Ships the same day we receive your payment.
                  </div>
                  <div className="flex items-center gap-1 text-sm text-neutral-600">
                    <TagIcon color={getPrimaryIconStroke()} size={20} />
                    Free shipping for orders over $1000.
                  </div>
                </div>
              </div>
            </Accordion>
            <Accordion
              label={`Payment Options`}
              open={open.payment}
              toggle={() => setOpen((prev) => ({ ...prev, payment: !prev.payment }))}
            >
              <div className="flex flex-col">
                {paymentOptions
                  .filter((payment) => !payment.disabled)
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
                            <Icon color={getPrimaryIconStroke()} size={20} />
                            <div className="text-base text-neutral-800">{payment.label}</div>
                          </div>
                          <div className="text-neutral-600 text-xs flex items-center gap-2 pt-1 pl-4">
                            <span className="text-left">{payment.time_delay}</span>
                            <CircleIcon size={6} weight="fill" className="text-neutral-300" />
                            <span className="text-right">{payment.subcharge}</span>
                          </div>
                        </div>
                        <div className="text-sm text-neutral-600">{payment.description}</div>
                      </div>
                    )
                  })}
              </div>
            </Accordion>
            <Accordion
              label={`Product Specifications`}
              open={open.specs}
              toggle={() => setOpen((prev) => ({ ...prev, specs: !prev.specs }))}
            >
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center w-full justify-between">
                  <div className="text-sm text-neutral-800">Weight (troy oz):</div>
                  <div className="text-sm text-neutral-600">{selectedProduct.gross.toFixed(4)}</div>
                </div>
                <div className="flex items-center w-full justify-between">
                  <div className="text-sm text-neutral-800">Purity:</div>
                  <div className="text-sm text-neutral-600">
                    {selectedProduct.purity.toFixed(4)}
                  </div>
                </div>
                <div className="flex items-center w-full justify-between">
                  <div className="text-sm text-neutral-800">
                    {selectedProduct.metal_type} Content:
                  </div>
                  <div className="text-sm text-neutral-600">
                    {selectedProduct.content.toFixed(4)}
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  )
}

function Accordion({
  label,
  open,
  toggle,
  children,
}: {
  label: string
  open: boolean
  toggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md bg-card raised-off-page p-2">
      <button
        type="button"
        onClick={toggle}
        className="w-full p-2 flex justify-between items-center tracking-widest uppercase text-xs lg:text-sm text-neutral-600 font-normal cursor-pointer"
      >
        {label}

        <ChevronDown
          className={cn('h-4 w-4 transition-transform text-neutral-600', open && 'rotate-180')}
          size={20}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden will-change-transform"
          >
            <div className="p-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
