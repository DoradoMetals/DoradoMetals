import * as React from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide } from "@dorado/icons";
import { cn } from "../cn";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full" {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  surface = "muted",
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & { surface?: "muted" | "card" }) {
  return (
    <thead
      className={cn("[&>tr]:h-10", surface === "card" ? "[&>tr]:bg-card" : "[&>tr]:bg-muted", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&>tr]:h-12 [&>tr:hover]:bg-accent", className)} {...props} />;
}

const ROW_INTENTS = {
  neutral: "",
  success: "bg-success-muted",
  danger: "bg-destructive-muted",
  warning: "bg-warning-muted",
  info: "bg-info-muted",
} as const;

export type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  selected?: boolean;
  borderless?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  intent?: keyof typeof ROW_INTENTS;
};

export function TableRow({
  className,
  selected,
  borderless = false,
  interactive = false,
  disabled = false,
  intent = "neutral",
  ...props
}: TableRowProps) {
  return (
    <tr
      data-state={selected ? "selected" : undefined}
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        borderless ? "border-b-0" : "border-b border-border",
        "transition-colors data-[state=selected]:bg-muted",
        ROW_INTENTS[intent],
        interactive && "cursor-pointer",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc" | null;

export function TableHead({
  className,
  numeric,
  sorted,
  onSort,
  filter,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  sorted?: SortDirection;
  onSort?: () => void;
  filter?: React.ReactNode;
}) {
  const sortable = onSort != null;
  const SortIcon = sorted === "asc" ? ArrowUpNarrowWide : sorted === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  return (
    <th
      scope="col"
      aria-sort={sortable ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
      className={cn(
        "px-sm align-middle text-micro font-medium text-muted-foreground",
        numeric ? "text-right" : "text-left",
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-2xs">
        {sortable ? (
          <button
            type="button"
            onClick={onSort}
            className="inline-flex cursor-pointer items-center gap-2xs hover:text-foreground"
          >
            {children}
            <SortIcon aria-hidden className="size-3" />
          </button>
        ) : (
          children
        )}
        {filter}
      </span>
    </th>
  );
}

export function TableCell({
  className,
  numeric,
  primary,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  primary?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-sm align-middle text-small",
        numeric ? "text-right tabular-nums" : "text-left",
        primary ? "font-medium text-foreground" : "text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
