'use client'

// Toast — the Figma set (132:1041) riding sonner (which was in the app's
// package.json, imported nowhere — a dead dependency until now). Alert is
// inline and stays; a Toast arrives and leaves. Surface/highest with a
// hairline (border separation, never shadow), intent rides a leading status
// icon in the hue — the surface never tints. Danger persists until dismissed;
// everything else leaves at 5s. Mount <Toaster /> once; call toast.* anywhere.
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
            'group pointer-events-auto flex w-[320px] items-start gap-2.5 rounded-[10px] border border-border bg-highest px-3.5 py-3 font-sans',
          icon: 'mt-[3px] shrink-0',
          content: 'flex min-w-0 flex-1 flex-col gap-px',
          title: 'text-sm font-medium text-foreground',
          description: 'text-sm text-muted-foreground',
          actionButton: 'ml-2 shrink-0 self-center text-sm font-medium text-foreground underline underline-offset-4',
          cancelButton: 'ml-2 shrink-0 self-center text-sm text-muted-foreground',
          closeButton: 'text-muted-foreground hover:text-foreground',
        },
      }}
      {...props}
    />
  )
}

// The house wrapper: danger persists until dismissed (the drawing's rule),
// so errors go out with no timer and a close affordance.
const toast = Object.assign(
  (message: React.ReactNode, opts?: Parameters<typeof sonnerToast>[1]) => sonnerToast(message, opts),
  sonnerToast,
  {
    error: (message: React.ReactNode, opts?: Parameters<typeof sonnerToast.error>[1]) =>
      sonnerToast.error(message, { duration: Infinity, closeButton: true, ...opts }),
  },
)

export { Toaster, toast }
