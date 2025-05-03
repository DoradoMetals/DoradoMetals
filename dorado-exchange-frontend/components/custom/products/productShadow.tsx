import React from 'react'

type ProductShadowProps = {
  productType: string
  offset?: number
}

const bottomVariants: Record<number, string> = {
  0: 'translate-y-75',
  1: 'translate-y-76',
  2: 'translate-y-77',
  3: 'translate-y-78',
  4: 'translate-y-79',
  5: 'translate-y-80',
  6: 'translate-y-81',
}

const mobileVariants: Record<number, string> = {
  0: 'translate-y-72.5',
  1: 'translate-y-73.5',
  2: 'translate-y-74.5',
  3: 'translate-y-76.5',
  4: 'translate-y-77.5',
  5: 'translate-y-78.5',
  6: 'translate-y-79.5',
}

export const ProductShadow: React.FC<ProductShadowProps> = ({ productType, offset = 0 }) => {
  const mobileOffsetClass = mobileVariants[offset] ?? '-translate-y-72.5'
  const offsetClass = bottomVariants[offset] ?? '-translate-y-79'

  if (productType === 'Coin') {
    return (
      <>
        <div
          className={`hidden lg:block absolute z-40 left-1/2 -translate-x-1/2 ${offsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
        />
        <div
          className={`lg:hidden absolute z-40 left-1/2 -translate-x-1/2 ${mobileOffsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
        />
      </>
    )
  }

  if (productType === 'Bar') {
    return (
      <>
        <div
          className={`hidden lg:block absolute z-40 left-1/2 -translate-x-1/2 ${offsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
        />
        <div
          className={`lg:hidden absolute z-40 left-1/2 -translate-x-1/2 ${mobileOffsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
        />
      </>
    )
  }

  if (productType === 'Collectible') {
    return (
      <>
        <div
          className={`hidden lg:block absolute z-40 left-1/2 -translate-x-1/2 ${offsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
        />
        <div
          className={`lg:hidden absolute z-40 left-1/2 -translate-x-1/2 ${mobileOffsetClass} w-40 h-2 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.25)_20%,_transparent_80%)]`}
        />
      </>
    )
  }

  return null
}
