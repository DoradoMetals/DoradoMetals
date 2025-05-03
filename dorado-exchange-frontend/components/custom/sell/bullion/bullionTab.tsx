import { ProductGroup, useAllProducts } from '@/lib/queries/useProducts'
import Image from 'next/image'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ozOptions, Product } from '@/types/product'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import fuzzysort from 'fuzzysort'
import { Button } from '@/components/ui/button'
import { ChevronsLeft, ChevronsRight, Minus, Plus, X } from 'lucide-react'
import getProductBidPrice from '@/utils/getProductBidPrice'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { Slider } from '@/components/ui/slider'
import NumberFlow from '@number-flow/react'
import { cn } from '@/lib/utils'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper/modules'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import { sellCartStore } from '@/store/sellCartStore'

type SelectedProductGroup = {
  product: Product
  variants: Product[]
}

export default function BullionTab() {
  const { data: bullionProducts = [], isLoading } = useAllProducts()
  const [selected, setSelected] = useState<SelectedProductGroup | null>(null)
  const [input, setInput] = useState('')
  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)

  const [quantity, setQuantity] = useState(1)
  const min = 1
  const max = 100

  const quantityOffset = (() => {
    if (quantity < 25) return 0.25
    if (quantity < 50) return 0.15
    if (quantity < 75) return 0.0
    if (quantity < 90) return -0.15
    return -0.25
  })()

  const { data: spotPrices = [] } = useSpotPrices()
  const spot = spotPrices.find((s) => s.type === selected?.product.metal_type)

  const handleClick = (group: ProductGroup) => {
    setSelected({
      product: group.default,
      variants: group.variants,
    })
  }

  const filteredBullion = input
    ? fuzzysort
        .go(
          input,
          bullionProducts.map((p) => ({
            ...p,
            searchText: `${p.default.product_name} ${p.default.metal_type}`,
          })),
          {
            keys: ['searchText'],
            limit: 50,
            threshold: -10000,
          }
        )
        .map((r) => r.obj)
    : bullionProducts

  const handleClear = () => {
    setInput('')
  }

  const addItem = sellCartStore.getState().addItem

  const handleAddBullion = (values: Product) => {
    if (!selected?.product || !spot) return
    console.log(quantity)
    const item = {
      type: 'product' as const,
      data: {
        ...values,
        quantity,
      },
    }

    addItem(item)
    setInput('')
    setSelected(null)
  }

  return (
    <div className="relative flex flex-col gap-4 mt-8">
      <div className="relative w-full">
        <FloatingLabelInput
          label="Search Products"
          size="sm"
          className="input-floating-label-form"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {input !== '' && (
          <Button
            variant="ghost"
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
            tabIndex={-1}
          >
            <X size={16} />
          </Button>
        )}
      </div>

      <Swiper
        modules={[Navigation]}
        spaceBetween={0}
        navigation={{
          nextEl: '.bullion-swiper-next',
          prevEl: '.bullion-swiper-prev',
        }}
        slidesPerView={'auto'}
        onReachBeginning={() => setIsBeginning(true)}
        onReachEnd={() => setIsEnd(true)}
        onFromEdge={() => {
          setIsBeginning(false)
          setIsEnd(false)
        }}
        slidesPerGroup={5}
        className="relative w-full bullion-swiper mx-auto mb-6"
      >
        {filteredBullion.map((group) => (
          <SwiperSlide key={group.default.product_name} className="!w-auto">
            <div
              onClick={() => handleClick(group)}
              className="flex flex-col items-center w-20 cursor-pointer"
            >
              <div
                className={cn(
                  'bg-background w-18 h-18 rounded-full flex items-center justify-center',
                  selected?.product.product_name === group.default.product_name
                    ? 'border-2 border-secondary'
                    : 'raised-off-page'
                )}
              >
                <Image
                  width={500}
                  height={500}
                  src={group.default.image_front}
                  alt={group.default.product_name}
                  className="w-18 h-18 object-contain"
                />
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      <div className="hidden lg:block absolute top-3/4 -left-12 -translate-y-1/2 bullion-swiper-prev z-20">
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            isBeginning
              ? `text-neutral-400 pointer-events-none hover:text-neutral-400`
              : 'text-neutral-700'
          )}
        >
          <ChevronsLeft size={24} />
        </Button>
      </div>

      <div className="hidden lg:block absolute top-3/4 -right-10 -translate-y-1/2 bullion-swiper-next z-20">
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            isEnd
              ? `text-neutral-400 pointer-events-none hover:text-neutral-400`
              : 'text-neutral-700'
          )}
        >
          <ChevronsRight size={24} />
        </Button>
      </div>

      {selected?.product.variant_group && ozOptions[selected.product.variant_group] && (
        <RadioGroup
          value={selected.product.product_name}
          onValueChange={(val) => {
            const variant = selected.variants.find((v) => v.product_name === val)
            if (variant) {
              setSelected({
                ...selected,
                product: variant,
              })
            }
          }}
          className="flex gap-3 w-full items-center justify-between"
        >
          {ozOptions[selected.product.variant_group].map((option) => {
            const isSelected = selected.product.product_name === option.name

            return (
              <motion.label
                key={option.name}
                initial={false}
                animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                className={cn(
                  'relative cursor-pointer rounded-lg border flex items-center justify-center text-sm min-h-[2.5rem] px-3 h-2 flex-1 ',
                  isSelected
                    ? 'border-secondary bg-secondary text-white'
                    : 'border-border bg-background text-neutral-800 raised-off-page'
                )}
              >
                <RadioGroupItem
                  value={option.name}
                  id={option.name}
                  className="sr-only after:absolute after:inset-0"
                  disabled={option.disabled}
                />
                {option.value}
              </motion.label>
            )
          })}
        </RadioGroup>
      )}

      {selected && (
        <div className="flex flex-col w-full gap-3 mt-2">
          <div className="flex w-full justify-between items-center">
            <div className="text-base text-neutral-800">{selected.product.product_name}</div>
            <div className="text-lg text-neutral-900">
              <PriceNumberFlow value={getProductBidPrice(selected.product, spot)} />
            </div>
          </div>

          <div className="flex items-start w-full gap-6">
            <Button
              variant="ghost"
              className="text-neutral-800 mt-2"
              onClick={() => setQuantity((prev) => Math.max(min, prev - 1))}
              disabled={quantity <= min}
            >
              <Minus size={20} />
            </Button>

            <div className="relative mt-6 mb-12 w-full">
              <Slider
                value={[quantity]}
                onValueChange={(e) => setQuantity(e[0])}
                min={min}
                max={max}
                step={1}
              />
              <div
                className="absolute top-4 text-sm text-neutral-700"
                style={{
                  left: `calc(${(quantity / max) * 100}% + ${quantityOffset}rem)`,
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                <NumberFlow
                  willChange
                  value={quantity}
                  isolate
                  opacityTiming={{ duration: 250, easing: 'ease-out' }}
                  transformTiming={{ duration: 500, easing: 'ease-out' }}
                  spinTiming={{ duration: 150, easing: 'ease-out' }}
                  trend={0}
                />
              </div>
            </div>

            <Button
              variant="ghost"
              className="text-neutral-800 mt-2"
              onClick={() => setQuantity((prev) => Math.min(max, prev + 1))}
            >
              <Plus size={20} />
            </Button>
          </div>
          <Button className="raised-off-page w-full bg-primary" onClick={() => {handleAddBullion(selected.product)}}>Add Item</Button>
        </div>
      )}
    </div>
  )
}
