'use client'

import type React from 'react'

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
  const { metal, category: filterCategory, type, setFilters } = useProductFilterStore()

  const handleClick = (category: string) => {
    switch (category) {
      // setFilters REPLACES the selection - each tile is one filter, and the
      // old calls each had to spell the other two as undefined to say so.
      case 'Gold':
      case 'Silver':
      case 'Platinum':
      case 'Palladium':
        setFilters({ metal: category })
        break
      case 'Eagles':
        setFilters({ category: 'American Eagle' })
        break
      case 'Maples':
        setFilters({ category: 'Canadian Maple' })
        break
      case 'Collectibles':
        setFilters({ type: 'Collectible' })
        break
      case 'President':
        setFilters({ category: 'President' })
        break
    }

    if (pathname !== '/buy') router.push('/buy')
  }

  const isActive = (category: string) => {
    if (pathname === '/') return false
  
    return (
      metal === category ||
      (type === 'Collectible' && category === 'Collectibles') ||
      (filterCategory === 'American Eagle' && category === 'Eagles') ||
      (filterCategory === 'Canadian Maple' && category === 'Maples') ||
      (filterCategory === 'President' && category === 'President')
    )
  }

  // A category tile is a control, and both variants were bare `<div onClick>`
  // (two of D93's eleven clickable divs with no role and no keyboard path).
  // They stay DIVS rather than becoming `<button>`s because `<button>` accepts
  // PHRASING content only: the mobile tile holds a `<div>` + `<Image>`, and the
  // desktop one holds a `<p>`. Same content-model trap ruling 22 flags for
  // `<span><p>`. role + tabIndex + a key handler is the valid form.
  const asButton = (onActivate: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  })

  return (
    <nav aria-label="Product categories">
      <div className={cn("hidden lg:flex w-full justify-center", pathname === '/' ? 'mt-1' : 'my-9')}>
        {categories.map((category, index) => (
          <div
            key={category.name}
            {...asButton(() => handleClick(category.name))}
            className={`flex cursor-pointer items-center px-9 ${
              index !== 0 ? 'border-l border-border' : ''
            }`}
          >
            {/* Was `text-placeholder` when inactive - 2.7:1 on the page ground,
                under AA and under the 3.0 floor RETIREMENT.md audits to. The
                <p> default (--muted-foreground, 6.96:1) is the muted step the
                three-tone hierarchy already defines, so the inactive state
                needs no colour class at all. */}
            <p
              className={`uppercase tracking-widest transition-colors ${
                isActive(category.name) ? 'text-primary' : 'hover:text-primary'
              }`}
            >
              {category.name}
            </p>
          </div>
        ))}
      </div>

      <div className="lg:hidden relative w-full flex justify-center mt-2">
        <motion.div className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-4 will-change-transform">
          {categories.map((category) => (
            <div
              key={category.name}
              {...asButton(() => handleClick(category.name))}
              className="flex flex-col items-center w-20 cursor-pointer"
            >
              {/* LIVE DEFECT FIXED: the selected ring was `border-secondary`,
                  and --secondary stopped being a hue in the palette flip - it
                  is now hsl(225,9%,15%), all but identical to the `border-border`
                  the UNSELECTED thumbnails carry, so "selected" was invisible.
                  --primary (white) is the monochrome answer MANUAL-VERIFICATION
                  5.2 names. `shadow-md` goes with ruling 16. */}
              <div
                className={`bg-card w-18 h-18 rounded-full flex items-center justify-center border ${
                  isActive(category.name) ? 'border-primary border-2' : 'border-border'
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
              <small className="mt-1 text-center w-full whitespace-nowrap overflow-hidden">
                {category.name}
              </small>
            </div>
          ))}
        </motion.div>
      </div>
    </nav>
  )
}
