'use client'

// Dialog - the drawing at 41:55: "Modal panel on surface/highest - the top of
// the elevation stack - separated by a border, not a shadow. A drop shadow
// would darken a #09090c ground and render as nothing (ruling 27). Footer
// holds real Button instances: Tertiary/Neutral to dismiss, Primary/Danger to
// confirm; swap the confirm intent to Neutral for non-destructive dialogs."
//
// Radix owns what matters most and cannot be drawn: focus is trapped and
// restored, Escape closes, the page behind is aria-hidden, and Title/
// Description label the dialog to assistive tech. The overlay keeps the app's
// existing language - a blur, not a black wash - and the panel animates in
// with motion-reduce collapsing it.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "../button/Button";
import { cn } from "../cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  size = "md",
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: "sm" | "md";
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-80 backdrop-blur-xs",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          "motion-reduce:animate-none"
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-90 -translate-x-1/2 -translate-y-1/2",
          "flex w-[calc(100vw-2rem)] flex-col gap-4 rounded-lg border border-border bg-highest p-4",
          size === "sm" ? "max-w-80" : "max-w-[420px]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "motion-reduce:animate-none",
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close asChild>
            <Button
              variant="tertiary"
              size="iconXs"
              aria-label="Close"
              className="absolute right-4 top-4"
            >
              <X aria-hidden className="size-4" />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("pr-8 text-h4 font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start gap-2", className)} {...props} />;
}

export const DialogOverlay = DialogPrimitive.Overlay;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2", className)} {...props} />;
}
