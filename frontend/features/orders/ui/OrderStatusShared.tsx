'use client'

import { Button, Select, Swiper } from '@dorado/components'
import { ListIcon } from '@dorado/icons'
import { cn } from '@/shared/utils/cn'

const ALL = '__all__'

type StatusConfigEntry = {
  icon: React.ComponentType<{ size?: number; className?: string; color?: string }>
  [key: string]: any
}

type StatusSelectorProps = {
  statuses: readonly string[]
  statusConfig: Record<string, StatusConfigEntry>
  selectedStatus: string | null
  setSelectedStatus: (s: string | null) => void
  open: boolean
  setOpen: (v: boolean) => void
  mobileSwiperClassName?: string
}

export function OrderStatusSelector({
  statuses,
  statusConfig,
  selectedStatus,
  setSelectedStatus,
  open,
  setOpen,
  mobileSwiperClassName,
}: StatusSelectorProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-2 w-full">
      <div className="flex lg:hidden w-full">
        <Swiper
          label="Order status filters"
          className={cn('w-full z-10', mobileSwiperClassName)}
          slideClassName="py-2"
        >
          {statuses.map((status) => {
            const config = statusConfig[status]
            const Icon = config.icon
            const isSelected = selectedStatus === status

            return (
              <Button
                key={status}
                variant={isSelected ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedStatus(isSelected ? null : status)}
                className="whitespace-nowrap"
              >
                <Icon size={16} />
                <span>{status}</span>
              </Button>
            )
          })}
        </Swiper>
      </div>

      <div className="hidden lg:flex">
        <Select
          className="w-60"
          value={selectedStatus ?? ALL}
          onValueChange={(value) => setSelectedStatus(value === ALL ? null : value)}
          items={[
            {
              value: ALL,
              label: (
                <span className="flex items-center gap-2">
                  <ListIcon size={14} />
                  All Orders
                </span>
              ),
            },
            ...statuses.map((status) => {
              const Icon = statusConfig[status].icon
              return {
                value: status,
                label: (
                  <span className="flex items-center gap-2">
                    <Icon size={14} />
                    {status}
                  </span>
                ),
              }
            }),
          ]}
        />
      </div>
    </div>
  )
}
