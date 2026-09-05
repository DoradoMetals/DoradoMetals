'use client'

import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { ExternalLink } from '@dorado/icons'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const linkVariants = cva(
  'cursor-pointer font-medium focus-visible:outline-none aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  {
    variants: {
      intent: {
        neutral: 'text-foreground',
        muted: 'text-muted-foreground hover:text-foreground',
        foreground: 'text-foreground',
        success: 'text-success',
        danger: 'text-destructive',
        warning: 'text-warning',
        info: 'text-info',
      },
      variant: {
        inline: 'text-small underline-offset-4 hover:underline focus-visible:underline',
        nav: 'nav-link transition-colors',
      },
    },
    defaultVariants: { intent: 'neutral', variant: 'inline' },
  }
)

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof linkVariants> {
  asChild?: boolean
  external?: boolean
  active?: boolean
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  (
    { className, intent, variant, active, asChild = false, external = false, children, ...props },
    ref
  ) => {
    const resolvedIntent = variant === 'nav' ? (active ? 'neutral' : 'muted') : intent
    const Comp = asChild ? Slot : 'a'
    return (
      <Comp
        className={cn(
          external && 'inline-flex items-center gap-[5px]',
          linkVariants({ intent: resolvedIntent, variant, className })
        )}
        ref={ref}
        aria-current={active ? 'page' : undefined}
        {...props}
      >
        {external && <ExternalLink aria-hidden className="size-3 shrink-0" />}
        <Slottable>{children}</Slottable>
      </Comp>
    )
  }
)
Link.displayName = 'Link'

export { Link, linkVariants }
