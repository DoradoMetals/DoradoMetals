'use client'

// Slider - the drawing at 31:115: 4px muted track, primary fill, 16px thumb;
// "track and thumb radii are fixed geometry." Radix underneath: keyboard
// (arrows, Home/End, PageUp/Down), aria-valuenow and the drag machinery are
// its; the caller labels it (aria-label / aria-labelledby), because a slider
// that reads as "50" with no subject is a number in the void.
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../cn";

export type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root>;

export function Slider({ className, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
      </SliderPrimitive.Track>
      {/* The label must land on the THUMB - that is where role="slider"
          lives, and a label on the root div names nothing. axe caught the
          package version shipping exactly that. */}
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={cn(
          "block size-4 cursor-grab rounded-full border border-border-strong bg-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        )}
      />
    </SliderPrimitive.Root>
  );
}
