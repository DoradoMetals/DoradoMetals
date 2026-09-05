'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../cn'

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-2', className)} {...props} />
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
            ? 'flex items-center border-b border-border'
            : 'inline-flex items-center gap-1 rounded-lg bg-muted p-1',
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'underline'
          ? 'px-3 py-2 data-[state=active]:text-foreground'
          : 'rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border',
        className
      )}
      {...props}
    />
  )
}
