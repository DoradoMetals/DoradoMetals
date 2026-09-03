'use client'

import * as React from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Toaster as Sonner, toast as sonnerToast } from 'sonner'

function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="bottom-right"
      visibleToasts={3}
      duration={5000}
      gap={8}
      icons={{
        success: <CircleCheck className="size-4 text-success" aria-hidden />,
        error: <CircleAlert className="size-4 text-destructive" aria-hidden />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group pointer-events-auto flex w-[320px] items-start gap-2.5 rounded-surface border border-border bg-highest px-3.5 py-3 font-sans',
          icon: 'mt-[3px] shrink-0',
          content: 'flex min-w-0 flex-1 flex-col gap-px',
          title: 'text-small font-medium text-foreground',
          description: 'text-small text-muted-foreground',
          actionButton: 'ml-2 shrink-0 self-center text-small font-medium text-foreground underline underline-offset-4',
          cancelButton: 'ml-2 shrink-0 self-center text-small text-muted-foreground',
          closeButton: 'text-muted-foreground hover:text-foreground',
        },
      }}
      {...props}
    />
  )
}

const toast = Object.assign(
  (message: React.ReactNode, opts?: Parameters<typeof sonnerToast>[1]) => sonnerToast(message, opts),
  sonnerToast,
  {
    error: (message: React.ReactNode, opts?: Parameters<typeof sonnerToast.error>[1]) =>
      sonnerToast.error(message, { duration: Infinity, closeButton: true, ...opts }),
  },
)

export { Toaster, toast }
