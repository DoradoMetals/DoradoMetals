'use client'

import * as React from "react";
import { Search } from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import { Checkbox } from "../checkbox/Checkbox";
import { cn } from "../cn";
import { Input } from "../input/Input";
import { Pagination } from "../pagination/Pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table/Table";

export type DataTableColumnMeta = {
  numeric?: boolean;
  primary?: boolean;
};

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSelectionFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableColumn<T extends RowData> = ColumnDef<typeof features, T>;

const SELECT_COLUMN_ID = "__select";

export type DataTableProps<T extends RowData> = {
  columns: DataTableColumn<T>[];
  data: T[];
  label: string;
  getRowId?: (row: T, index: number) => string;
  empty?: React.ReactNode;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
  selectable?: boolean;
  onRowSelectionChange?: (rows: T[]) => void;
  onRowClick?: (row: T) => void;
  pageSize?: number;
};

export function DataTable<T extends RowData>({
  columns,
  data,
  label,
  getRowId,
  empty,
  className,
  searchable = false,
  searchPlaceholder = "Search",
  actions,
  selectable = false,
  onRowSelectionChange,
  onRowClick,
  pageSize,
}: DataTableProps<T>) {
  const helper = React.useMemo(() => createColumnHelper<typeof features, T>(), []);

  const tableColumns = React.useMemo<DataTableColumn<T>[]>(() => {
    if (!selectable) return columns;
    return [
      helper.display({
        id: SELECT_COLUMN_ID,
        enableHiding: false,
        enableGlobalFilter: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
            aria-label="Select row"
          />
        ),
      }),
      ...columns,
    ];
  }, [columns, helper, selectable]);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? Infinity,
  });

  const table = useTable<typeof features, T>({
    features,
    columns: tableColumns,
    data,
    getRowId,
    defaultColumn: { enableSorting: false, enableColumnFilter: false },
    sortDescFirst: false,
    enableRowSelection: selectable,
    globalFilterFn: "includesString",
    state: { sorting, columnFilters, globalFilter, rowSelection, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  });

  const rows = table.getRowModel().rows;

  React.useEffect(() => {
    if (!onRowSelectionChange) return;
    onRowSelectionChange(table.getSelectedRowModel().rows.map((row) => row.original));
  }, [rowSelection, data, onRowSelectionChange]);

  return (
    <div className={cn("flex w-full flex-col gap-sm", className)}>
      {(searchable || actions != null) && (
        <div className="flex flex-wrap items-center gap-sm">
          {searchable && (
            <Input
              type="search"
              value={globalFilter}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              leading={<Search aria-hidden className="size-4" />}
              aria-label="Search table"
              className="w-64"
            />
          )}
          {actions != null && <div className="ml-auto flex items-center gap-xs">{actions}</div>}
        </div>
      )}
      <Table aria-label={label}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                const numeric = header.column.columnDef.meta?.numeric;
                return (
                  <TableHead
                    key={header.id}
                    numeric={numeric}
                    sorted={canSort ? (sortDirection === false ? null : sortDirection) : undefined}
                    onSort={canSort ? () => header.column.toggleSorting() : undefined}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={table.getAllLeafColumns().length}>{empty ?? "No results."}</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                selected={selectable ? row.getIsSelected() : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onRowClick(row.original);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TableCell key={cell.id} numeric={meta?.numeric} primary={meta?.primary}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {pageSize != null && (
        <Pagination
          page={pagination.pageIndex + 1}
          pageCount={Math.max(1, table.getPageCount())}
          onPageChange={(page) => table.setPageIndex(page - 1)}
        />
      )}
    </div>
  );
}
