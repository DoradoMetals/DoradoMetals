import React from 'react'

type ProductShadowProps = {
  productType: string
  offset?: number
}

const bottomVariants: Record<number, string> = {
  0: 'bottom-6',
  1: 'bottom-5',
  2: 'bottom-4',
  3: 'bottom-3',
  4: 'bottom-2',
  5: 'bottom-1',
  6: 'bottom-0',
}

export const ProductShadow: React.FC<ProductShadowProps> = ({ productType, offset = 0 }) => {
  const offsetClass = bottomVariants[offset] ?? 'bottom-3'

  if (productType === 'Coin') {
    return (
      <div
        className={`absolute z-10 ${offsetClass} left-1/2 -translate-x-1/2 w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
      />
    )
  }

  if (productType === 'Bar') {
    return (
      <div
      className={`absolute z-10 ${offsetClass} left-1/2 -translate-x-1/2 w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
      />
    )
  }

  if (productType === 'Collectible') {
    return (
      <></>
      // <div
      // className={`absolute z-10 ${offsetClass} left-1/2 -translate-x-1/2 w-28 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
      // />
    )
  }

  return null
}
