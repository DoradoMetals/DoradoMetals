'use client'

// Accordion - the collapsible row from the Figma library (Themes and
// Components, node 32:36: "chevron, label, trailing amount, and an expandable
// detail body. Chevron rotates 180 when open. The Content frame is a slot.")
//
// THE DESIGN'S GEOMETRY, ADOPTED EXACTLY: the chevron LEADS (the old
// AccordionSection trailed it), the header is p-3 gap-2 with a Body/Medium
// label at foreground, the body is pl-4 pr-3 pb-3, and the container is
// bg-card separated by border - never shadow (ruling 19).
//
// WHAT THE DESIGN CANNOT SAY, OWNED HERE - the best-practice hallmarks Figma
// has no axis for (its Accordion carries Open and nothing else; the gaps are
// recorded in docs/waves/phase10-design-system.md):
//   - the header is a real <button> with aria-expanded and aria-controls
//   - the body is a labelled region, inert and aria-hidden while closed, so
//     a collapsed panel is out of the tab order rather than merely small
//   - focus is the system's focus-visible ring, exactly as button.tsx spells
//     it - a state the design does not draw but every sibling control has
//   - motion is the CSS grid-rows trick (0fr -> 1fr), which animates both
//     directions with no dependency and collapses to nothing under
//     motion-reduce. framer-motion is deliberately NOT imported: the package
//     must stay light enough to take anywhere.
//   - NOT Radix: their Accordion earns its weight when a GROUP shares
//     exclusive-open state, which no call site has. A lone disclosure is
//     forty lines.
//
// `surface` is a degree of prominence, not two components (the old file's own
// rule): `card` is the drawn treatment; `bare` drops the fill for embedding
// on a surface that is already a card. Layout comes from the call site via
// className; appearance does not (the call-site rule in base/button.tsx).
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

const SURFACES = {
  card: "bg-card border border-border",
  bare: "border border-border bg-transparent",
} as const;

export type AccordionProps = {
  label: ReactNode;
  /** Right-hand slot on the header - the Figma "amount". Any node: the money
   *  formatting stays the app's business, not the library's. */
  trailing?: ReactNode;
  /** Controlled open state; omit both `open` and `onToggle` to self-manage. */
  open?: boolean;
  onToggle?: () => void;
  /** Initial state when self-managed. */
  defaultOpen?: boolean;
  disabled?: boolean;
  surface?: keyof typeof SURFACES;
  className?: string;
  children: ReactNode;
};

export function Accordion({
  label,
  trailing,
  open,
  onToggle,
  defaultOpen = false,
  disabled = false,
  surface = "card",
  className,
  children,
}: AccordionProps) {
  const [selfOpen, setSelfOpen] = useState(defaultOpen);
  const isOpen = open ?? selfOpen;
  const toggle = onToggle ?? (() => setSelfOpen((prev) => !prev));
  const id = useId();
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;

  return (
    <div className={cn("rounded-lg overflow-clip", SURFACES[surface], className)}>
      <button
        type="button"
        id={headerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 p-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            isOpen && "rotate-180"
          )}
        />
        <span className="min-w-0 flex-1 font-medium text-foreground">{label}</span>
        {trailing != null && (
          <span className="shrink-0 font-medium text-foreground">{trailing}</span>
        )}
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-3 pl-4 pr-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
