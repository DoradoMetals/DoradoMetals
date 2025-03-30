'use client'

import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useProductFilterStore } from '@/store/productFilterStore'

const categories = [
  { name: 'Gold', img: '/product_images/elemetal_products/gold/American Eagle/BACK.png' },
  { name: 'Silver', img: '/product_images/elemetal_products/silver/1oz Unity/FRONT.png' },
  { name: 'Platinum', img: '/product_images/elemetal_products/platinum/American Eagle/BACK.png' },
  { name: 'Palladium', img: '/product_images/elemetal_products/palladium/1oz Palladium Bar/FRONT.png' },
  { name: 'Coins', img: '/product_images/elemetal_products/gold/Canadian Maple/FRONT.png' },
  { name: 'Bars', img: '/product_images/elemetal_products/silver/1oz Unity/FRONT.png' },
  { name: 'Collectibles', img: '/product_images/elemetal_products/silver/1oz .45 ACP Silver Bullet/FRONT.png' },
  { name: 'Private', img: '/product_images/elemetal_products/silver/Elemetal Round/FRONT.png' },
  { name: 'Sovereign', img: '/product_images/elemetal_products/gold/American Buffalo/FRONT.png' },
]

export default function AvatarCarousel() {
  const router = useRouter()
  const pathname = usePathname()

  const handleClick = (category: string) => {
    const setFilters = useProductFilterStore.getState().setFilters
  
    switch (category) {
      case 'Gold':
      case 'Silver':
      case 'Platinum':
      case 'Palladium':
        setFilters({ metal_type: category, product_type: undefined, mint_type: undefined })
        break
      case 'Coins':
        setFilters({ product_type: 'Coin', metal_type: undefined, mint_type: undefined })
        break
      case 'Bars':
        setFilters({ product_type: 'Bar', metal_type: undefined, mint_type: undefined })
        break
      case 'Collectibles':
        setFilters({ product_type: 'Collectible', metal_type: undefined, mint_type: undefined })
        break
      case 'Private':
        setFilters({ mint_type: 'Private', metal_type: undefined, product_type: undefined })
        break
      case 'Sovereign':
        setFilters({ mint_type: 'Sovereign', metal_type: undefined, product_type: undefined })
        break
    }
  
    if (pathname !== '/buy') router.push('/buy')
  }

  return (
    <div className="relative w-full">
      <motion.div className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-3">
        {categories.map((category, index) => (
          <div
            key={index}
            onClick={() => handleClick(category.name)}
            className="flex flex-col items-center w-20 cursor-pointer"
          >
            <div className="w-18 h-18 rounded-full bg-card flex items-center justify-center">
              <img src={category.img} alt={category.name} className="w-20 h-20 object-contain" />
            </div>
            <span className="secondary-text mt-1 text-center w-full whitespace-nowrap overflow-hidden">
              {category.name}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
