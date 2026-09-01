'use client'

// ScrollArea - a scrolling region with a styled bar, because the native one
// is an OS artefact: it differs per platform, it is a bright slab on macOS
// with "always show" enabled, and on Windows it eats 17px of layout width
// that nothing in the design accounts for. Radix draws the bar instead and
// keeps native wheel/touch/keyboard scrolling underneath.
//
// The bar is a TRACK plus a THUMB, both off the neutral ramp and never a
// hue: a scrollbar reports position, it does not ask for attention. The
// track is a `muted` channel, the thumb `border-strong` inset 2px inside
// it, and both are full-radius rails (the same sanctioned pill as
// Progress). The channel matters - it is what says "this scrolls" even
// when the thumb is parked at one end and could otherwise read as a
// decorative edge.
//
// WHERE THIS EARNS ITS KEEP: any height-capped list - the Datepicker's slot
// column, Upload's attachment stack, the long legal pages. Those cap their
// height so a third item cannot resize the card; this makes the overflow
// reachable and legible instead of merely clipped.
import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "../cn";

export type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /** Vertical is the common case; horizontal for wide tables and rails. */
  orientation?: "vertical" | "horizontal" | "both";
};

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, orientation = "vertical", type = "hover", ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    // "hover" keeps the bar out of the way until it is wanted; the scroll
    // itself never depends on the bar being visible. Overridable because
    // "always" is the honest choice when the overflow IS the point.
    type={type}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      className={cn(
        "size-full rounded-[inherit]",
        // A keyboard user can focus and arrow through the region, so it has
        // to show that it is focused.
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      )}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    {(orientation === "vertical" || orientation === "both") && <ScrollBar orientation="vertical" />}
    {(orientation === "horizontal" || orientation === "both") && <ScrollBar orientation="horizontal" />}
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none rounded-full bg-muted p-0.5 transition-opacity",
      "data-[state=hidden]:opacity-0 motion-reduce:transition-none",
      orientation === "vertical" && "my-1 mr-1 h-[calc(100%-0.5rem)] w-2.5",
      orientation === "horizontal" && "mx-1 mb-1 h-2.5 w-[calc(100%-0.5rem)] flex-col",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border-strong" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
