// Table - the drawings at 56:82/56:33: card container, muted header strip with
// Micro/Medium labels and a sort affordance, 48px rows carrying their own
// bottom hairline ("the table needs no internal dividers"), hover filling
// with accent and selection with muted, numeric columns right-aligned
// independently of their text.
//
// The drawing names its own maintenance cost - "column widths live on the row
// component; change them there and the header must be changed to match" -
// and a REAL <table> dissolves it: columns are columns, so widths live once.
// Sortable headers are real buttons carrying aria-sort on their <th>, and the
// wrapper scrolls horizontally so a wide table never scrolls the page.
import * as React from "react";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
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
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  /** Current direction when this column sorts; null = sortable, unsorted. */
  sort?: SortDirection;
  onSort?: () => void;
}) {
  const sortable = onSort != null;
  const Icon = sort === "asc" ? ChevronUp : sort === "desc" ? ChevronDown : ChevronsUpDown;
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
  /** Right-aligned, tabular figures - the drawing's numeric columns. */
  numeric?: boolean;
  /** Small/Medium at foreground - the drawing's leading and value columns. */
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
