'use client'

// Tabs - the drawings at 39:23/39:37 plus the Underline bar added 2026-08-30.
// TWO variants now:
//   underline (default) - the full-width hairline rail in border colour, the
//     active tab's 2px segment in primary. The detail worth its weight: the
//     indicator is present in every state as a transparent border so the tab
//     never shifts height on selection.
//   boxed - the original drawn Tab Bar: segments in a muted tray, the active
//     one lifted onto card with a hairline.
// Radix underneath: roving tabindex, arrow keys, aria-selected and the
// tab/tabpanel wiring are its.
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../cn";

// The root stacks list over panel; the lift dropped this and every call site
// written against it (they pass `flex` for width tweaks) collapsed into a row.
export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-2", className)} {...props} />;
}
export const TabsContent = TabsPrimitive.Content;

type TabsVariant = "underline" | "boxed";
const TabsVariantContext = React.createContext<TabsVariant>("underline");

export function TabsList({
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        className={cn(
          variant === "underline"
            ? "flex items-center border-b border-border"
            : "inline-flex items-center gap-1 rounded-lg bg-muted p-1",
          className
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "cursor-pointer text-small font-medium text-muted-foreground transition-colors",
        "hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "underline"
          ? // -mb-px sits the indicator ON the list's hairline, not above it.
            "-mb-px border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary data-[state=active]:text-foreground"
          : "rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border",
        className
      )}
      {...props}
    />
  );
}
