'use client'

import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const buttonVariants = cva(
  'cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-transparent font-medium ring-offset-background transition-[color,background-color,border-color,opacity] hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: '',
        secondary: 'bg-transparent',

        tertiary: 'bg-transparent',
      },
      intent: {
        neutral: '',
        success: '',
        danger: '',
        warning: '',
        info: '',
      },
      size: {
        xs: 'h-7 px-2.5 text-micro gap-xs [&_svg]:size-3.5',

        sm: 'h-8 px-sm text-micro tracking-normal gap-xs [&_svg]:size-3.5',
        default: 'h-10 px-md text-small gap-xs [&_svg]:size-4',

        lg: 'h-11 px-6 text-small sm:text-body gap-xs [&_svg]:size-5',
        xl: 'h-12 px-10 text-body sm:text-h6 gap-xs [&_svg]:size-5',
        icon: 'h-10 w-10 p-0 [&_svg]:size-5',
        iconSm: 'h-8 w-8 p-0 [&_svg]:size-4',
        iconXs: 'h-7 w-7 p-0 [&_svg]:size-3.5',
        iconInline: 'h-4 w-4 p-0 [&_svg]:size-3.5',
      },
    },
    compoundVariants: [
      { variant: 'primary', intent: 'neutral', className: 'bg-primary text-primary-foreground' },
      { variant: 'primary', intent: 'success', className: 'bg-success text-success-foreground' },
      {
        variant: 'primary',
        intent: 'danger',
        className: 'bg-destructive text-destructive-foreground',
      },
      { variant: 'primary', intent: 'warning', className: 'bg-warning text-warning-foreground' },
      { variant: 'primary', intent: 'info', className: 'bg-info text-info-foreground' },

      { variant: 'secondary', intent: 'neutral', className: 'border-border text-foreground' },
      { variant: 'secondary', intent: 'success', className: 'border-success text-success' },
      { variant: 'secondary', intent: 'danger', className: 'border-destructive text-destructive' },
      { variant: 'secondary', intent: 'warning', className: 'border-warning text-warning' },
      { variant: 'secondary', intent: 'info', className: 'border-info text-info' },

      { variant: 'tertiary', className: 'px-2 -mx-2' },

      { variant: 'tertiary', intent: 'neutral', className: 'text-subtle' },
      { variant: 'tertiary', intent: 'success', className: 'text-success' },
      { variant: 'tertiary', intent: 'danger', className: 'text-destructive' },
      { variant: 'tertiary', intent: 'warning', className: 'text-warning' },
      { variant: 'tertiary', intent: 'info', className: 'text-info' },
    ],
    defaultVariants: { variant: 'primary', intent: 'neutral', size: 'default' },
  }
)

export type ButtonEmphasis = 'primary' | 'secondary' | 'tertiary'
export type ButtonIntent = 'neutral' | 'success' | 'danger' | 'warning' | 'info'

const ICON_PX_BY_SIZE = {
  xs: 14,
  sm: 14,
  default: 16,
  lg: 20,
  xl: 20,
  icon: 20,
  iconSm: 16,
  iconXs: 14,
  iconInline: 14,
} as const

const strokeWidthFor = (px: number) => (2 * px) / 24

export interface ButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>,
    Omit<VariantProps<typeof buttonVariants>, 'variant' | 'intent'> {
  variant?: ButtonEmphasis
  intent?: ButtonIntent
  asChild?: boolean

  type?: 'button' | 'submit' | 'reset'
}

interface IconProps {
  icon: React.ElementType

  iconPlacement?: 'left' | 'right'
  iconSize?: number
}
interface IconRefProps {
  icon?: never
  iconPlacement?: undefined
  iconSize?: never
}
export type ButtonIconProps = IconProps | IconRefProps

const Button = React.forwardRef<HTMLButtonElement, ButtonProps & ButtonIconProps>(
  (
    {
      className,
      variant,
      intent,
      size,
      icon: Icon,
      iconPlacement = 'left',
      iconSize,
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    const strokeWidth = strokeWidthFor(ICON_PX_BY_SIZE[size ?? 'default'])
    return (
      <Comp
        className={cn(buttonVariants({ variant, intent, size, className }))}
        ref={ref}
        {...props}
      >
        {Icon && iconPlacement === 'left' && <Icon size={iconSize} strokeWidth={strokeWidth} />}
        <Slottable>{props.children}</Slottable>
        {Icon && iconPlacement === 'right' && <Icon size={iconSize} strokeWidth={strokeWidth} />}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
