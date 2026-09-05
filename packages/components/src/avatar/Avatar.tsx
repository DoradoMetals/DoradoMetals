'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const avatarVariants = cva(
  'relative flex shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary',
  {
    variants: {
      size: {
        xs: 'size-6 text-micro',
        sm: 'size-8 text-micro',
        md: 'size-10 text-small',
        lg: 'size-14 text-body',
      },
      shape: {
        circle: 'rounded-full',
        square: 'rounded-lg',
      },
    },
    defaultVariants: { size: 'md', shape: 'circle' },
  }
)

export type AvatarProps = React.ComponentProps<typeof AvatarPrimitive.Root> &
  VariantProps<typeof avatarVariants> & {
    src?: string
    alt?: string
    fallback?: React.ReactNode
  }

export function Avatar({
  className,
  size,
  shape,
  src,
  alt,
  fallback,
  children,
  ...props
}: AvatarProps) {
  return (
    <AvatarPrimitive.Root className={cn(avatarVariants({ size, shape }), className)} {...props}>
      {src && <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center text-foreground">
        {fallback ?? children}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
