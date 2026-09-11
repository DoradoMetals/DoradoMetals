'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../cn'

const textVariants = cva('', {
  variants: {
    variant: {
      display: 'display',
      h1: 'text-h1',
      h2: 'text-h2',
      h3: 'text-h3',
      h4: 'text-h4',
      h5: 'text-h5',
      h6: 'text-h6',
      body: 'text-body',
      'body-medium': 'text-body font-medium',
      small: 'text-small',
      'small-medium': 'text-small font-medium',
      micro: 'micro',
      'micro-medium': 'micro font-medium',
      eyebrow: 'eyebrow',
      stat: 'stat',
      'stat-sm': 'stat-sm',
    },
    emphasis: {
      default: '',
      subtle: '',
      subtlest: '',
    },
  },
  defaultVariants: { variant: 'body' },
})

export type TextVariant = NonNullable<VariantProps<typeof textVariants>['variant']>
export type TextEmphasis = NonNullable<VariantProps<typeof textVariants>['emphasis']>

const DEFAULT_TAG: Record<TextVariant, React.ElementType> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'p',
  'body-medium': 'p',
  small: 'small',
  'small-medium': 'small',
  micro: 'p',
  'micro-medium': 'p',
  eyebrow: 'p',
  stat: 'p',
  'stat-sm': 'p',
}

export type TextProps = {
  variant?: TextVariant
  emphasis?: TextEmphasis
  as?: React.ElementType
  className?: string
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'color'>

export const Text = React.forwardRef<HTMLElement, TextProps>(function Text(
  { variant = 'body', emphasis, as, className, children, ...props },
  ref
) {
  const Comp = (as ?? DEFAULT_TAG[variant]) as React.ElementType
  return (
    <Comp
      ref={ref}
      data-emphasis={emphasis}
      className={cn(textVariants({ variant }), className)}
      {...props}
    >
      {children}
    </Comp>
  )
})

export { textVariants }
