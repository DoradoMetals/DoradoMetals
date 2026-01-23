'use client'

import type { Table as TanTable } from '@tanstack/react-table'
import { ColumnsIcon } from '@phosphor-icons/react'

import { Button } from '@/shared/ui/base/button'
import { Checkbox } from '@/shared/ui/base/checkbox'
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
        <Button variant="ghost" size="sm" className={cn('text-neutral-800 h-10', triggerClass)}>
          <ColumnsIcon size={28} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-fit space-y-2 rounded-lg" align="center" side="bottom">
        <div className="flex justify-center text-xs text-neutral-600 p-2 glass-panel rounded-t-lg font-light">
          Toggle Displayed
        </div>

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
                className="text-primary cursor-pointer on-glass data-[state=checked]:text-primary"
              />
              <label
                htmlFor={`col-${column.id}`}
                className="text-xs cursor-pointer text-left text-neutral-800 tracking-wide font-normal"
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

        <div className="flex items-center gap-1 justify-center text-xs text-neutral-600 py-1 px-2 rounded-b-lg pb-2 font-light">
          <span className="text-neutral-900">
            {table.getAllLeafColumns().filter((col) => !col.getIsVisible()).length}
          </span>
          <span>hidden</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
