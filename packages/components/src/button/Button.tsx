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
        xs: 'h-7 text-micro gap-xs [&_svg]:size-3.5',

        sm: 'min-h-(--control-sm) text-micro tracking-normal gap-2xs [&_svg]:size-3.5',
        default: 'min-h-(--control-md) text-small gap-2xs-plus [&_svg]:size-4',

        lg: 'min-h-(--control-lg) text-body gap-xs [&_svg]:size-5',
        xl: 'h-12 text-body sm:text-h6 gap-xs [&_svg]:size-5',
        icon: 'size-(--control-md) p-0 [&_svg]:size-5',
        iconSm: 'size-(--control-sm) p-0 [&_svg]:size-4',
        iconXs: 'size-7 p-0 [&_svg]:size-4',
        iconInline: 'size-4 p-0 [&_svg]:size-3.5',
      },
    },
    compoundVariants: [
      { variant: ['primary', 'secondary'], size: 'xs', className: 'px-2.5' },
      { variant: ['primary', 'secondary'], size: 'sm', className: 'px-sm' },
      { variant: ['primary', 'secondary'], size: 'default', className: 'px-md' },
      { variant: ['primary', 'secondary'], size: 'lg', className: 'px-lg' },
      { variant: ['primary', 'secondary'], size: 'xl', className: 'px-10' },
      { variant: 'tertiary', size: ['sm', 'default', 'lg'], className: 'min-h-0' },
      { variant: 'tertiary', size: ['xs', 'xl'], className: 'h-auto' },
      {
        variant: 'tertiary',
        size: ['icon', 'iconSm', 'iconXs'],
        className: 'size-auto',
      },

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

      { variant: 'tertiary', className: 'border-0' },

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
  iconXs: 16,
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
