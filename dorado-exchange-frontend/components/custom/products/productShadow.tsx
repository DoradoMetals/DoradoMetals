import React from 'react'

type ProductShadowProps = {
  productType: string
  offset?: number
}

const bottomVariants: Record<number, string> = {
  0: 'translate-y-76',
  1: 'translate-y-77',
  2: 'translate-y-78',
  3: 'translate-y-79',
  4: 'translate-y-80',
  5: 'translate-y-81',
  6: 'translate-y-82',
}

export const ProductShadow: React.FC<ProductShadowProps> = ({ productType, offset = 0 }) => {
  const offsetClass = bottomVariants[offset] ?? '-translate-y-76'

  if (productType === 'Coin') {
    return (
      <div
        className={`absolute z-40 left-1/2 -translate-x-1/2 ${offsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
      />
    )
  }

  if (productType === 'Bar') {
    return (
      <div
        className={`absolute z-40 ${offsetClass} left-1/2 -translate-x-1/2 w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
      />
    )
  }

  if (productType === 'Collectible') {
    return (
      <div
        className={`absolute z-40 ${offsetClass} left-1/2 -translate-x-1/2 w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
      />
    )
  }

  return null
}
