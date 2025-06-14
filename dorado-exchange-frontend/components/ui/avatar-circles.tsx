'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface AvatarCirclesProps {
  className?: string
  num?: number
  avatarUrls: string[]
}

const AvatarCircles = ({ num, className, avatarUrls }: AvatarCirclesProps) => {
  return (
    <div className={cn('z-10 flex -space-x-6 rtl:space-x-reverse items-center -ml-2', className)}>
      {avatarUrls.map((url, index) => (
        <img
          key={index}
          className="h-14 w-14 rounded-full"
          src={url}
          width={500}
          height={500}
          alt={`Avatar ${index + 1}`}
        />
      ))}
      {num && num > avatarUrls.length && (
        <div className="cursor-default flex h-12 w-12 items-center justify-center rounded-full border-2 border-card text-xs font-medium bg-neutral-300 text-neutral-700">
          +{num - avatarUrls.length}
        </div>
      )}
    </div>
  )
}

export { AvatarCircles }
