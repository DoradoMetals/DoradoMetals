'use client'

import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useProductFilterStore } from '@/store/productFilterStore'

const categories = [
  { name: 'Gold', img: '/product_images/elemetal_products/gold/American Eagle/BACK.png' },
  { name: 'Silver', img: '/product_images/elemetal_products/silver/1oz Unity/FRONT.png' },
  { name: 'Platinum', img: '/product_images/elemetal_products/platinum/American Eagle/BACK.png' },
  {
    name: 'Palladium',
    img: '/product_images/elemetal_products/palladium/1oz Palladium Bar/FRONT.png',
  },
  { name: 'Coins', img: '/product_images/elemetal_products/gold/Canadian Maple/FRONT.png' },
  { name: 'Bars', img: '/product_images/elemetal_products/silver/1oz Unity/FRONT.png' },
  {
    name: 'Collectibles',
    img: '/product_images/elemetal_products/silver/1oz .45 ACP Silver Bullet/FRONT.png',
  },
  {
    name: 'Private Mint',
    img: '/product_images/elemetal_products/silver/Elemetal Round/FRONT.png',
  },
  {
    name: 'Sovereign Mint',
    img: '/product_images/elemetal_products/gold/American Buffalo/FRONT.png',
  },
]

export default function AvatarCarousel() {
  const router = useRouter()
  const pathname = usePathname()
  const { metal_type, mint_type, product_type, setFilters } = useProductFilterStore()

  const handleClick = (category: string) => {
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
      case 'Private Mint':
        setFilters({ mint_type: 'Private', metal_type: undefined, product_type: undefined })
        break
      case 'Sovereign Mint':
        setFilters({ mint_type: 'Sovereign', metal_type: undefined, product_type: undefined })
        break
    }

    if (pathname !== '/buy') router.push('/buy')
  }

  const isActive = (category: string) => {
    return (
      metal_type === category ||
      (product_type === 'Coin' && category === 'Coins') ||
      (product_type === 'Bar' && category === 'Bars') ||
      (product_type === 'Collectible' && category === 'Collectibles') ||
      (mint_type === 'Private' && category === 'Private Mint') ||
      (mint_type === 'Sovereign' && category === 'Sovereign Mint')
    )
  }

  return (
    <div className="my-12">
      <div className="hidden lg:flex w-full justify-center">
        {categories.map((category, index) => (
          <div
            key={category.name}
            onClick={() => handleClick(category.name)}
            className={`flex cursor-pointer items-center px-10 ${
              index !== 0 ? 'border-l border-neutral-300' : ''
            }`}
          >
            <span
              className={`text-xs font-semibold tracking-widest uppercase transition-colors ${
                isActive(category.name) ? 'text-secondary' : 'text-neutral-400 hover:text-secondary'
              }`}
            >
              {category.name}
            </span>
          </div>
        ))}
      </div>

      <div className="lg:hidden relative w-full flex justify-center">
        <motion.div className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-3">
          {categories.map((category) => (
            <div
              key={category.name}
              onClick={() => handleClick(category.name)}
              className="flex flex-col items-center w-20 cursor-pointer"
            >
              <div
                className={`w-18 h-18 rounded-full bg-background flex items-center justify-center border ${
                  isActive(category.name) ? 'border-secondary shadow-md' : 'border-neutral-300'
                }`}
              >
                <img src={category.img} alt={category.name} className="w-16 h-16 object-contain" />
              </div>
              <span className="tertiary-text mt-1 text-center w-full whitespace-nowrap overflow-hidden">
                {category.name}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
