'use client'

import type { Table as TanTable } from '@tanstack/react-table'
import { ColumnsIcon } from '@phosphor-icons/react'

import { Button } from '@dorado/components'
import { Checkbox } from '@dorado/components'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { cn } from '@/shared/utils/cn'

export function TableColumnVisibility<TData>({
  table,
  triggerClass,
}: {
  table: TanTable<TData>
  triggerClass: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="tertiary" size="sm" className={cn(triggerClass)}>
          <ColumnsIcon size={28} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-fit space-y-2" align="center" side="bottom">
        <small className="flex justify-center p-2 bg-highest border border-border rounded-t-lg">
          Toggle Displayed
        </small>

        <div className="flex flex-col gap-2 px-2">
          {table.getAllLeafColumns().map((column) => (
            <div
              key={column.id}
              className="flex items-center gap-4 w-full border-b-1 border-border pb-2"
            >
              <Checkbox
                id={`col-${column.id}`}
                checked={column.getIsVisible()}
                onCheckedChange={() => column.toggleVisibility()}
                className="cursor-pointer"
              />
              <label
                htmlFor={`col-${column.id}`}
                className="cursor-pointer text-left tracking-wide"
              >
                {typeof column.columnDef.header === 'function'
                  ? column.id
                      .split('_')
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')
                  : column.columnDef.header}
              </label>
            </div>
          ))}
        </div>

        <small className="flex items-center gap-1 justify-center py-1 px-2 rounded-b-lg pb-2">
          <span className="text-foreground">
            {table.getAllLeafColumns().filter((col) => !col.getIsVisible()).length}
          </span>
          <span>hidden</span>
        </small>
      </PopoverContent>
    </Popover>
  )
}
