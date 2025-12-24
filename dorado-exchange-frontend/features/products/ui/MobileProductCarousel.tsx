'use client'

import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useProductFilterStore } from '@/shared/store/productFilterStore'
import Image from 'next/image'
import { cn } from '@/shared/utils/cn'

const categories = [
  { name: 'Gold', img: '/product_images/elemetal_products/gold/American Buffalo/FRONT.png' },
  { name: 'Silver', img: '/product_images/elemetal_products/silver/Western Warrior/FRONT.png' },
  { name: 'Platinum', img: '/product_images/elemetal_products/platinum/1oz Platinum Bar/FRONT.png' },
  {
    name: 'Palladium',
    img: '/product_images/elemetal_products/palladium/1oz Palladium Bar/FRONT.png',
  },
  { name: 'Eagles', img: '/product_images/elemetal_products/gold/American Eagle/BACK.png' },
  { name: 'Maples', img: '/product_images/elemetal_products/silver/Canadian Maple/FRONT.png' },
  {
    name: 'Collectibles',
    img: '/product_images/elemetal_products/silver/1oz .45 ACP Silver Bullet/FRONT.png',
  },
  {
    name: 'President',
    img: '/product_images/elemetal_products/silver/47th President Round/FRONT.png',
  },
]

export default function MobileProductCarousel() {
  const router = useRouter()
  const pathname = usePathname()
  const { metal_type, filter_category, product_type, setFilters } = useProductFilterStore()

  const handleClick = (category: string) => {
    switch (category) {
      case 'Gold':
      case 'Silver':
      case 'Platinum':
      case 'Palladium':
        setFilters({ metal_type: category, product_type: undefined, filter_category: undefined })
        break
      case 'Eagles':
        setFilters({ filter_category: 'American Eagle', metal_type: undefined, product_type: undefined })
        break
      case 'Maples':
        setFilters({ filter_category: 'Canadian Maple', metal_type: undefined, product_type: undefined })
        break
      case 'Collectibles':
        setFilters({ product_type: 'Collectible', metal_type: undefined, filter_category: undefined })
        break
      case 'President':
        setFilters({ filter_category: 'President', metal_type: undefined, product_type: undefined })
        break
    }

    if (pathname !== '/buy') router.push('/buy')
  }

  const isActive = (category: string) => {
    if (pathname === '/') return false
  
    return (
      metal_type === category ||
      (product_type === 'Collectible' && category === 'Collectibles') ||
      (filter_category === 'American Eagle' && category === 'Eagles') ||
      (filter_category === 'Canadian Maple' && category === 'Maples') ||
      (filter_category === 'President' && category === 'President')
    )
  }

  return (
    <div className="">
      <div className={cn("hidden lg:flex w-full justify-center", pathname === '/' ? 'mt-1' : 'my-9')}>
        {categories.map((category, index) => (
          <div
            key={category.name}
            onClick={() => handleClick(category.name)}
            className={`flex cursor-pointer items-center px-9 ${
              index !== 0 ? 'border-l border-neutral-300' : ''
            }`}
          >
            <span
              className={`text-base font-semibold tracking-widest uppercase transition-colors ${
                isActive(category.name) ? 'text-primary' : 'text-neutral-400 hover:text-primary'
              }`}
            >
              {category.name}
            </span>
          </div>
        ))}
      </div>

      <div className="lg:hidden relative w-full flex justify-center mt-2">
        <motion.div className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-4 will-change-transform">
          {categories.map((category) => (
            <div
              key={category.name}
              onClick={() => handleClick(category.name)}
              className="flex flex-col items-center w-20 cursor-pointer"
            >
              <div
                className={`bg-card w-18 h-18 rounded-full flex items-center justify-center border ${
                  isActive(category.name)
                    ? 'border-secondary border-2 shadow-md'
                    : 'border-border'
                }`}
              >
                <Image
                  width={500}
                  height={500}
                  src={category.img}
                  alt={category.name}
                  className="w-16 h-16 object-contain"
                />
              </div>
              <span className="text-xs mt-1 text-center w-full whitespace-nowrap overflow-hidden">
                {category.name}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
