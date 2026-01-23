'use client'

import type { Table as TanTable } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ReactNode } from 'react'
import { Button } from '@/shared/ui/base/button'

export function TablePagination<TData>({
  table,
  footerRightContent,
}: {
  table: TanTable<TData>
  footerRightContent?: ReactNode
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1" />

      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </span>

        <Button
          variant="ghost"
          size="icon"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex justify-end">{footerRightContent}</div>
    </div>
  )
}
