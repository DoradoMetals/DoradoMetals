'use client'

import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getProductPrice from '@/utils/getProductPrice'
import { Product } from '@/types/product'
import NumberFlow from '@number-flow/react'

type ProductPriceProps = {
  product: Product
}

export default function ProductPrice({ product }: ProductPriceProps) {
  const { data: spotPrices = [] } = useSpotPrices()
  const spot = spotPrices.find((s) => s.type === product.metal_type)
  const price = getProductPrice(product, spot)
  const quantity = product.quantity || 1

  return (
    <NumberFlow
      value={price * quantity}
      format={{
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }}
      opacityTiming={{ duration: 250, easing: 'ease-out' }}
      transformTiming={{
        easing: `linear(0, 0.0033 0.8%, 0.0263 2.39%, 0.0896 4.77%, 0.4676 15.12%, 0.5688, 0.6553, 0.7274, 0.7862, 0.8336 31.04%, 0.8793, 0.9132 38.99%, 0.9421 43.77%, 0.9642 49.34%, 0.9796 55.71%, 0.9893 62.87%, 0.9952 71.62%, 0.9983 82.76%, 0.9996 99.47%)`,
        duration: 500,
      }}
      spinTiming={{ duration: 150, easing: 'ease-out' }}
    />
  )
}
