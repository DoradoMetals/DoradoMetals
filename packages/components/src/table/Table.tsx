import * as React from "react";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Funnel } from "lucide-react";
import { cn } from "../cn";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <table className="w-full caption-bottom" {...props} />
    </div>
  );
}

export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-muted" {...props} />;
}

export type SortDirection = "asc" | "desc" | null;

export function TableHead({
  className,
  numeric,
  sort,
  onSort,
  filtered,
  onFilter,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  sort?: SortDirection;
  onSort?: () => void;
  filtered?: boolean;
  onFilter?: () => void;
}) {
  const sortable = onSort != null;
  const Icon = sort === "asc" ? ArrowUpNarrowWide : sort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;
  return (
    <th
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined}
      className={cn(
        "h-10 border-b border-border px-3 text-micro font-medium text-muted-foreground",
        numeric ? "text-right" : "text-left",
        className
      )}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-1", numeric && "flex-row-reverse")}>
        {sortable ? (
          <button
            type="button"
            onClick={onSort}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 hover:text-foreground",
              numeric && "flex-row-reverse"
            )}
          >
            {children}
            <Icon aria-hidden className="size-3" />
          </button>
        ) : (
          children
        )}
        {onFilter != null && (
          <button
            type="button"
            aria-label="Filter column"
            aria-pressed={filtered || undefined}
            onClick={onFilter}
            className={cn(
              "inline-flex cursor-pointer items-center hover:text-foreground",
              filtered && "text-foreground"
            )}
          >
            <Funnel aria-hidden className={cn("size-3", filtered && "fill-current")} />
          </button>
        )}
      </span>
    </th>
  );
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      data-state={selected ? "selected" : undefined}
      className={cn(
        "h-12 border-b border-border transition-colors last:border-b-0",
        "hover:bg-accent data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
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
        "px-3 text-small",
        numeric && "text-right tabular-nums",
        primary ? "font-medium text-foreground" : "text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
