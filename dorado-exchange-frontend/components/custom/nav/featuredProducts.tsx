'use client'

import { useState } from 'react'
import { useHomepageProducts } from '@/lib/queries/useProducts'
import ProductCard from '../products/productCard'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import { Button } from '@/components/ui/button'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'

export default function FeaturedProducts() {
  const { data: products = [] } = useHomepageProducts()
  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)

  return (
    <div className="w-full mb-4 lg:mb-0 justify-center items-center">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation={{
          nextEl: '.featured-swiper-next',
          prevEl: '.featured-swiper-prev',
        }}
        pagination={{ clickable: true }}
        slidesPerView={1}
        slidesPerGroup={1}
        spaceBetween={10}
        breakpoints={{
          718: { slidesPerView: 2, slidesPerGroup: 2 },
          1375: { slidesPerView: 3, slidesPerGroup: 3 },
          1811: { slidesPerView: 4, slidesPerGroup: 4 },
          2304: { slidesPerView: 5, slidesPerGroup: 5 },
        }}
        onReachBeginning={() => setIsBeginning(true)}
        onReachEnd={() => setIsEnd(true)}
        onFromEdge={() => {
          setIsBeginning(false)
          setIsEnd(false)
        }}
        className="w-full z-10 featured-swiper justify-center items-center flex justify-center items-center
        [&.featured-swiper_.swiper-pagination]:!static [&.featured-swiper_.swiper-pagination]:lg:mt-2
        [&.featured-swiper_.swiper-pagination-bullet]:!bg-neutral-700
        [&.featured-swiper_.swiper-pagination-bullet]:!opacity-30
        [&.featured-swiper_.swiper-pagination-bullet-active]:!opacity-100
      "
      >
        {products.map(({ default: product, variants }) => (
          <SwiperSlide>
            <ProductCard product={product} variants={variants} />
          </SwiperSlide>
        ))}

        <div className="hidden lg:block absolute -bottom-8 -translate-y-1/2 featured-swiper-prev z-20">
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              isBeginning
                ? `text-neutral-400 pointer-events-none hover:text-neutral-400`
                : 'text-neutral-900'
            )}
          >
            <ChevronsLeft size={32} />
          </Button>
        </div>

        <div className="hidden lg:block absolute -bottom-8 right-0 -translate-y-1/2 featured-swiper-next z-20">
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              isEnd
                ? `text-neutral-400 pointer-events-none hover:text-neutral-400`
                : 'text-neutral-900'
            )}
          >
            <ChevronsRight size={32} />
          </Button>
        </div>
      </Swiper>
    </div>
  )
}
