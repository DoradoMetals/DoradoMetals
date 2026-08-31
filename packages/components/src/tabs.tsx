'use client'

// Tabs - the drawings at 39:23/39:37. The detail worth its weight: "the 2px
// indicator is present in every state at zero opacity so the tab never shifts
// height when it becomes active - a common cause of the whole bar jumping on
// selection." Spelled here as a transparent border-bottom that only colours.
//
// Radix underneath: roving tabindex, arrow keys, aria-selected and the
// tab/tabpanel wiring are its.
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex items-center border-b border-border", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // -mb-px sits the indicator ON the list's hairline, not above it.
        "-mb-px cursor-pointer border-b-2 border-transparent px-3 py-2 text-small font-medium text-muted-foreground transition-colors",
        "hover:text-foreground",
        "data-[state=active]:border-primary data-[state=active]:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
