'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../cn'

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-xs', className)} {...props} />
}
export const TabsContent = TabsPrimitive.Content

type TabsVariant = 'underline' | 'boxed'
const TabsVariantContext = React.createContext<TabsVariant>('underline')

export function TabsList({
  className,
  variant = 'underline',
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null)

  const measure = React.useCallback((trigger: HTMLElement | null) => {
    const list = listRef.current
    if (!trigger || !list) return
    const listRect = list.getBoundingClientRect()
    const triggerRect = trigger.getBoundingClientRect()
    setIndicator({ left: triggerRect.left - listRect.left, width: triggerRect.width })
  }, [])

  React.useLayoutEffect(() => {
    if (variant !== 'underline') return
    const active =
      listRef.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? null
    measure(active)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure(active))
    if (listRef.current) observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [variant, measure, children])

  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={listRef}
        onFocus={variant === 'underline' ? (e) => measure(e.target as HTMLElement) : undefined}
        className={cn(
          'relative',
          variant === 'underline'
            ? 'flex items-center gap-2xs border-b border-border'
            : 'inline-flex items-center gap-2xs rounded-lg bg-muted p-2xs',
          className
        )}
        {...props}
      >
        {children}
        {variant === 'underline' && indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-0.5 bg-primary transition-[left,width] duration-150 motion-reduce:transition-none"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </TabsPrimitive.List>
    </TabsVariantContext.Provider>
  )
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'cursor-pointer text-small font-medium text-muted-foreground transition-colors',
        'hover:text-foreground',
        'focus-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'underline'
          ? 'px-sm pt-xs pb-xs-plus data-[state=active]:text-foreground'
          : 'rounded-md px-sm py-xs data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border',
        className
      )}
      {...props}
    />
  )
}

export type TabsNavItem = {
  value: string
  label: React.ReactNode
  href?: string
  disabled?: boolean
}

export type TabsNavProps = {
  items: TabsNavItem[]
  current?: string
  linkComponent?: React.ElementType
  'aria-label': string
  className?: string
}

export function TabsNav({
  items,
  current,
  linkComponent: LinkComponent = 'a',
  'aria-label': label,
  className,
}: TabsNavProps) {
  const listRef = React.useRef<HTMLUListElement>(null)
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null)

  React.useLayoutEffect(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !active) {
      setIndicator(null)
      return
    }
    const measure = () => {
      const listRect = list.getBoundingClientRect()
      const rect = active.getBoundingClientRect()
      setIndicator({ left: rect.left - listRect.left, width: rect.width })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [current, items])

  const look = cn(
    'inline-flex cursor-pointer px-sm pt-xs pb-xs-plus text-small font-medium text-muted-foreground transition-colors',
    'hover:text-foreground focus-ring'
  )

  return (
    <nav aria-label={label} data-part="tabs-nav" className={cn('flex flex-col gap-xs', className)}>
      <ul ref={listRef} className="relative flex items-center gap-2xs border-b border-border">
        {items.map((item) => (
          <li key={item.value} data-part="tab" className="flex">
            {item.disabled || !item.href ? (
              <span className={cn(look, 'pointer-events-none opacity-50')}>{item.label}</span>
            ) : (
              <LinkComponent
                href={item.href}
                aria-current={item.value === current ? 'page' : undefined}
                className={cn(look, 'aria-[current=page]:text-foreground')}
              >
                {item.label}
              </LinkComponent>
            )}
          </li>
        ))}
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-0.5 bg-primary transition-[left,width] duration-150 motion-reduce:transition-none"
            style={{ left: indicator.left, width: indicator.width }}
          />
        )}
      </ul>
    </nav>
  )
}
