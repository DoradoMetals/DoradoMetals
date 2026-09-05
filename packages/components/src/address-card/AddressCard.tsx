'use client'

import * as React from "react";
import { Pencil, Trash2 } from "@dorado/icons";

import { Badge } from "../badge/Badge";
import { Button } from "../button/Button";
import { cn } from "../cn";

export type AddressCardProps = {
  name: React.ReactNode;
  lines: React.ReactNode[];
  isDefault?: boolean;
  phone?: React.ReactNode;
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
  phone,
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
        "flex w-full flex-col gap-1 rounded-surface bg-card px-4 py-3.5 text-left",
        selected ? "border-[1.5px] border-border-strong" : "border border-border",
        pickable && "cursor-pointer transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        className
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-small font-medium text-foreground">{name}</span>
        {isDefault && <Badge intent="neutral" variant="soft">Default</Badge>}
      </span>
      {lines.map((line, i) => (
        <span key={i} className="text-small text-muted-foreground">{line}</span>
      ))}
      {phone != null && <span className="text-small text-muted-foreground">{phone}</span>}
      {(onEdit || onDelete) && (
        <span className="flex items-center gap-3 pt-2">
          {onEdit && (
            <Button variant="tertiary" size="sm" icon={Pencil} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="tertiary" intent="danger" size="sm" icon={Trash2} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              Delete
            </Button>
          )}
        </span>
      )}
    </Wrapper>
  );
}
