'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from '@dorado/icons'
import { Button } from '../button/Button'
import { cn } from '../cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  size = 'md',
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: 'sm' | 'md' | 'lg'
  showClose?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-80 bg-background/70 backdrop-blur-sm',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'motion-reduce:animate-none'
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-90 -translate-x-1/2 -translate-y-1/2',
          'flex w-[calc(100vw-var(--spacing-lg)*2)] flex-col gap-md rounded-lg border border-border bg-highest p-md',
          size === 'sm' ? 'max-w-80' : size === 'lg' ? 'max-w-[60rem]' : 'max-w-[26.25rem]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'motion-reduce:animate-none',
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close asChild>
            <Button
              variant="tertiary"
              size="iconSm"
              aria-label="Close"
              className="absolute right-md top-md"
            >
              <X aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn('pr-xl text-h4 text-foreground', className)} {...props} />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-body text-muted-foreground', className)}
      {...props}
    />
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start gap-xs', className)} {...props} />
}

export const DialogOverlay = DialogPrimitive.Overlay
export const DialogPortal = DialogPrimitive.Portal

export function DialogFooter({
  className,
  meta,
  stacked = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { meta?: React.ReactNode; stacked?: boolean }) {
  return (
    <div
      className={cn(
        'flex',
        stacked ? 'flex-col-reverse gap-xs' : 'items-center justify-end gap-md',
        className
      )}
      {...props}
    >
      {meta && (
        <span className={cn('grow truncate text-small text-subtle', stacked && 'order-last')}>
          {meta}
        </span>
      )}
      {children}
    </div>
  )
}
