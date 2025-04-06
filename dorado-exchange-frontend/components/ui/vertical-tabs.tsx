"use client";
import * as React from "react";

import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";

const VerticalTabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    orientation="vertical"
    ref={ref}
    className={cn(
      "flex rounded-md p-1 gap-1",
      className
    )}
    {...props}
  />
));
VerticalTabs.displayName = TabsPrimitive.List.displayName;

const VerticalTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex flex-col h-auto items-center justify-start rounded-md p-1",
      className
    )}
    {...props}
  />
));

VerticalTabsList.displayName = TabsPrimitive.List.displayName;

const VerticalTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex items-center justify-start whitespace-nowrap rounded-sm px-3 py-1.5 transition-all disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));

VerticalTabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const VerticalTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ml-4 mt-2 focus-visible:outline-none",
      className
    )}
    {...props}
  />
));

VerticalTabsContent.displayName = TabsPrimitive.Content.displayName;

export { VerticalTabs, VerticalTabsContent, VerticalTabsList, VerticalTabsTrigger };
