'use client'

// Address Card - the Figma set (163:32, drawn 2026-08-30): one saved address.
// Selected (checkout "ship from") wears the 1.5px border-strong - the
// selection language, never a fill. In pickers the whole card is the radio
// target; standalone only the action buttons are interactive. An address is
// not a secret, but it IS customer data - never log it.
import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "../badge/Badge";
import { Button } from "../button/Button";
import { cn } from "../cn";

export type AddressCardProps = {
  name: React.ReactNode;
  /** Street, unit - one node per line. */
  lines: React.ReactNode[];
  isDefault?: boolean;
  /** Renders as the radio target when set (with aria-checked). */
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
};

export function AddressCard({
  name,
  lines,
  isDefault = false,
  selected,
  onSelect,
  onEdit,
  onDelete,
  className,
}: AddressCardProps) {
  const pickable = onSelect != null;
  const Wrapper = pickable ? "button" : "div";
  return (
    <Wrapper
      {...(pickable
        ? { type: "button" as const, role: "radio", "aria-checked": !!selected, onClick: onSelect }
        : {})}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] bg-card px-4 py-3.5 text-left",
        selected ? "border-[1.5px] border-border-strong" : "border border-border",
        pickable && "cursor-pointer transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        className
      )}
    >
      <span className="flex items-center gap-2">
        <span className="text-small font-medium text-foreground">{name}</span>
        {isDefault && <Badge intent="neutral" variant="soft">Default</Badge>}
      </span>
      {lines.map((line, i) => (
        <span key={i} className="text-small text-muted-foreground">{line}</span>
      ))}
      {(onEdit || onDelete) && (
        <span className="flex items-center gap-3 pt-2">
          {onEdit && (
            <Button variant="tertiary" size="xs" icon={Pencil} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="tertiary" intent="danger" size="xs" icon={Trash2} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              Delete
            </Button>
          )}
        </span>
      )}
    </Wrapper>
  );
}
