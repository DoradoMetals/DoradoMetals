'use client'

import { cn } from '@/lib/utils'
import NumberFlow from '@number-flow/react'
export default function PriceNumberFlow({value, className} : {value: number, className?: string}) {
  return (
    <NumberFlow
      willChange
      isolate
      respectMotionPreference={false}
      trend={-1}
      className={cn(``, className ?? '')}
      value={value}
      format={{
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }}
      opacityTiming={{ duration: 250, easing: 'ease-out' }}
      transformTiming={{
                  easing: `linear(0, 0.001 0.43%, 0.0045 0.94%, 0.0195 2.03%, 0.0444 3.19%, 0.0808 4.49%, 0.1593 6.81%, 0.3676 12.31%, 0.4683 15.14%, 0.5652, 0.6487 21.22%, 0.6871, 0.722, 0.7536 26%, 0.7832 27.67%, 0.8107, 0.835 31.15%, 0.8574 32.96%, 0.8776 34.84%, 0.897 36.94%, 0.9141 39.11%, 0.9293 41.43%, 0.9423 43.82%, 0.9539 46.43%, 0.9637 49.18%, 0.9789 55.34%, 0.9888 62.37%, 0.995 71.13%, 0.9983 82.58%, 0.9997 99.96%)`,
                  duration: 1500,
      }}
      spinTiming={{ duration: 150, easing: 'ease-out' }}
    />
  )
}