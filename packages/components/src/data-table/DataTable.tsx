'use client'

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  createFilteredRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  filterFns,
  flexRender,
  rowSortingFeature,
  type SortingState,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import { Chip } from "../chip/Chip";
import { cn } from "../cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table/Table";

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns,
  filterFns,
});

export type DataTableColumn<T extends RowData> = ColumnDef<typeof features, T>;

export type DataTableProps<T extends RowData> = {
  columns: DataTableColumn<T>[];
  data: T[];
  label: string;
  empty?: React.ReactNode;
  className?: string;
};

export function DataTable<T extends RowData>({ columns, data, label, empty, className }: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const table = useTable<typeof features, T>({
    features,
    columns,
    data,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {columnFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {columnFilters.map((f) => (
            <Chip
              key={f.id}
              label={`${f.id}: ${String(f.value)}`}
              onDismiss={() => setColumnFilters((cur) => cur.filter((x) => x.id !== f.id))}
            />
          ))}
        </div>
      )}
      <Table aria-label={label}>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const dir = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    sort={canSort ? (dir === false ? null : dir) : undefined}
                    onSort={canSort ? () => header.column.toggleSorting() : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length}>{empty ?? "No results."}</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
