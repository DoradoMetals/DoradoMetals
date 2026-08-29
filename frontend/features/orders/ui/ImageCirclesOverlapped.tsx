'use client'

import { cn } from '@/shared/utils/cn'
import Image from 'next/image'

interface AvatarItem {
  url: string
  count: number
}
interface AvatarCirclesProps {
  items: AvatarItem[]
  maxDisplay?: number
  className?: string
}

const AvatarCircles = ({ items, maxDisplay = 3, className }: AvatarCirclesProps) => {
  const displayed = items.slice(0, maxDisplay)
  const extra = items.length - displayed.length

  return (
    <div className={cn('flex -space-x-5 items-center', className)}>
      {displayed.map(({ url, count }, i) => (
        <div
          key={i}
          className="relative w-14 h-14 rounded-full"
        >
          <Image fill src={url} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
          {count > 1 && (
            <small className="absolute -top-2 left-2 bg-highest rounded-full px-1 -translate-x-1/3 translate-y-1/3">
              {count}
            </small>
          )}
        </div>
      ))}

      {extra > 0 && (
        <small className="w-14 h-14 rounded-full z-50 flex items-center justify-center bg-gray-200 border-2 border-card">
          +{extra}
        </small>
      )}
    </div>
  )
}

export { AvatarCircles }
