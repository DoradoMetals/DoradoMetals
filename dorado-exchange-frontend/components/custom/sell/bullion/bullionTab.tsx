import { useAllProducts } from '@/lib/queries/useProducts'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Product } from '@/types/product'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import fuzzysort from 'fuzzysort'
import { Button } from '@/components/ui/button'
import { ChevronsLeft, ChevronsRight, Minus, Plus, X } from 'lucide-react'
import getProductBidPrice from '@/utils/getProductBidPrice'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { Slider } from '@/components/ui/slider'
import NumberFlow from '@number-flow/react'

export default function BullionTab() {
  const { data: bullionProducts = [], isLoading } = useAllProducts()
  const [selected, setSelected] = useState<Product | null>(null)
  const [input, setInput] = useState('')

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

  const spot = spotPrices.find((s) => s.type === selected?.metal_type)

  const handleClick = (selected: Product) => {
    setSelected(selected)
    console.log(selected)
  }

  const filteredBullion = input
    ? fuzzysort
        .go(input, bullionProducts, {
          keys: ['product_name', 'metal_type'],
          limit: 50,
          threshold: -10000,
          scoreFn: (result) => Math.max(...result.map((r) => r.score)),
        })
        .map((r) => r.obj)
    : bullionProducts

  const handleClear = () => {
    setInput('')
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -500, behavior: 'smooth' })
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 500, behavior: 'smooth' })

  return (
    <div className="flex flex-col gap-4 mt-8">
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

      <div className="relative w-full">
        <Button
          onClick={scrollLeft}
          className="
          hidden lg:block absolute -left-8 top-1/2 -translate-y-1/2 z-10
          px-2 py-1 bg-transparent hover:bg-transparent
          outline-none ring-0 focus:outline-none focus:ring-0
          focus-visible:outline-none focus-visible:ring-0
          focus:ring-offset-0 focus-visible:ring-offset-0
          shadow-none focus:shadow-none focus-visible:shadow-none
        "
          aria-label="Scroll left"
        >
          <ChevronsLeft size={16} className="text-neutral-600" />
        </Button>

        <motion.div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Product carousel"
          className="flex gap-1 overflow-x-auto scroll-smooth no-scrollbar focus:outline-none p-2"
        >
          {filteredBullion.map((bullion) => (
            <div
              key={bullion.product_name}
              onClick={() => handleClick(bullion)}
              className="flex flex-col items-center w-20 cursor-pointer scroll-snap-align-start"
            >
              <div
                className={`bg-card w-18 h-18 rounded-full flex items-center justify-center border ${
                  bullion === selected ? 'border-secondary border-2 shadow-md' : 'border-border'
                }`}
              >
                <Image
                  width={500}
                  height={500}
                  src={bullion.image_front}
                  alt={bullion.product_name}
                  className="w-18 h-18 object-contain"
                />
              </div>
            </div>
          ))}
        </motion.div>

        <Button
          onClick={scrollRight}
          className="
          hidden lg:block absolute -right-8 top-1/2 -translate-y-1/2 z-10
          px-2 py-1 bg-transparent hover:bg-transparent
          outline-none ring-0 focus:outline-none focus:ring-0
          focus-visible:outline-none focus-visible:ring-0
          focus:ring-offset-0 focus-visible:ring-offset-0
          shadow-none focus:shadow-none focus-visible:shadow-none
        "
          aria-label="Scroll right"
        >
          <ChevronsRight size={16} className="text-neutral-600" />
        </Button>
      </div>
      {selected && (
        <div className="flex flex-col w-full gap-5">
          <div className="flex w-full justify-between">
            <div className="text-lg text-neutral-800">{selected?.product_name}</div>
            <div className="text-base text-neutral-800">
              <PriceNumberFlow value={getProductBidPrice(selected, spot)} />
            </div>
          </div>
          <div className="flex items-start w-full gap-6">
            <Button
              variant="ghost"
              className="text-neutral-800 mt-2"
              onClick={() => setQuantity((prev) => prev - 1)}
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
                  transformTiming={{
                    easing: `linear(0, 0.0033 0.8%, 0.0263 2.39%, 0.0896 4.77%, 0.4676 15.12%, 0.5688, 0.6553, 0.7274, 0.7862, 0.8336 31.04%, 0.8793, 0.9132 38.99%, 0.9421 43.77%, 0.9642 49.34%, 0.9796 55.71%, 0.9893 62.87%, 0.9952 71.62%, 0.9983 82.76%, 0.9996 99.47%)`,
                    duration: 500,
                  }}
                  spinTiming={{ duration: 150, easing: 'ease-out' }}
                  trend={0}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              className="text-neutral-800 mt-2"
              onClick={() => setQuantity((prev) => prev + 1)}
            >
              <Plus size={20} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
