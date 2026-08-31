'use client'

// Accordion - the drawing at 32:36, rebuilt on Radix (Jacob: "in general we do
// want radix") with the header rendered THROUGH our Button ("Accordion should
// use our button") - so its focus ring, its disabled treatment and its hover
// escalate exactly as every other button does, from one file.
//
// THE DRAWING: chevron + label + trailing amount on a bg-card row split by
// border (never shadow - ruling 19); body pl-4 pr-3 pb-3; chevron rotates 180
// when open; "the Content frame is a slot."
//
// `chevron` places the affordance: 'leading' is the drawn default; 'trailing'
// is for informational accordions whose header has no right-hand amount
// (Jacob: "just in case we don't have content on both the left and right").
//
// WHAT RADIX BUYS over the hand-rolled version this replaces: grouped
// accordions come free (Root type single/multiple with collapsible), the
// open/close state machine is theirs, and the content region's aria wiring +
// hidden state are handled by the primitive. The height animation keeps the
// zero-dependency CSS approach, driven by Radix's own
// --radix-accordion-content-height variable, honouring motion-reduce.
//
// `surface` is a degree of prominence, not two components: `card` is the drawn
// treatment; `bare` drops the fill for embedding on a surface that is already
// a card.
import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

const SURFACES = {
  card: "bg-card border border-border",
  bare: "border border-border bg-transparent",
} as const;

export type AccordionProps = {
  label: React.ReactNode;
  /** Right-hand header slot - the drawing's "amount". Any node; money
   *  formatting stays the app's business. */
  trailing?: React.ReactNode;
  /** Where the chevron sits. 'leading' is the drawn default; 'trailing' suits
   *  informational accordions with nothing on the right. When `trailing`
   *  content is present the chevron stays leading regardless, so the two
   *  never collide on the right edge. */
  chevron?: "leading" | "trailing";
  /** Controlled open state; omit both `open` and `onToggle` to self-manage. */
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  disabled?: boolean;
  surface?: keyof typeof SURFACES;
  className?: string;
  children: React.ReactNode;
};

export function Accordion({
  label,
  trailing,
  chevron = "leading",
  open,
  onToggle,
  defaultOpen = false,
  disabled = false,
  surface = "card",
  className,
  children,
}: AccordionProps) {
  // Radix's single-collapsible Root drives one item; value is "it".
  const controlled = open !== undefined;
  const chevronTrailing = chevron === "trailing" && trailing == null;

  const marker = (
    <ChevronDown
      aria-hidden
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
        "group-data-[state=open]:rotate-180"
      )}
    />
  );

  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      disabled={disabled}
      {...(controlled
        ? { value: open ? "it" : "", onValueChange: () => onToggle?.() }
        : { defaultValue: defaultOpen ? "it" : undefined })}
      className={cn("rounded-lg overflow-clip", SURFACES[surface], className)}
    >
      <AccordionPrimitive.Item value="it">
        <AccordionPrimitive.Header asChild>
          <AccordionPrimitive.Trigger asChild>
            <Button
              variant="tertiary"
              // The header is a row, not an inline control: full width, the
              // drawing's p-3, content pushed apart. Layout classes only -
              // the call-site rule - and `group` so the chevron can read the
              // trigger's data-state.
              className="group mx-0 h-auto w-full justify-start gap-2 rounded-none border-transparent p-3 text-left"
            >
              {chevronTrailing ? null : marker}
              <span className="min-w-0 flex-1 font-medium text-foreground">{label}</span>
              {trailing != null && (
                <span className="shrink-0 font-medium text-foreground">{trailing}</span>
              )}
              {chevronTrailing ? marker : null}
            </Button>
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <AccordionPrimitive.Content
          className={cn(
            "overflow-hidden",
            "data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up",
            "motion-reduce:animate-none"
          )}
        >
          <div className="pb-3 pl-4 pr-3">{children}</div>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
}
