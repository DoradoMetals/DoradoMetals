'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Command, CommandItem, CommandList } from '@/shared/ui/base/command'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/lib/utils'
import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode } from 'swiper/modules'

import 'swiper/css'
import 'swiper/css/free-mode'
import { CaretDownIcon, CheckIcon, ListIcon } from '@phosphor-icons/react'
import { SearchX } from 'lucide-react'

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
  const selectedConfig = selectedStatus ? statusConfig[selectedStatus] : null
  const SelectedIcon = selectedConfig?.icon

  return (
    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-2 w-full">
      <div className="flex lg:hidden w-full">
        <Swiper
          modules={[FreeMode]}
          cssMode={true}
          freeMode={{
            enabled: true,
            momentum: true,
            momentumBounce: false,
            sticky: false,
          }}
          slidesPerView="auto"
          spaceBetween={6}
          className={cn('w-full z-10 flex items-center justify-center', mobileSwiperClassName)}
        >
          {statuses.map((status) => {
            const config = statusConfig[status]
            const Icon = config.icon
            const isSelected = selectedStatus === status

            return (
              <SwiperSlide key={status} className="!w-auto py-2">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedStatus(isSelected ? null : status)}
                  className={cn(
                    'text-sm px-4 py-1 whitespace-nowrap rounded-lg transition-colors duration-150 flex items-center gap-1 border border-transparent shadow-sm',
                    isSelected
                      ? 'bg-primary text-white'
                      : 'bg-card text-primary hover:bg-primary hover:text-white'
                  )}
                >
                  <Icon
                    size={16}
                    className={cn(
                      'transition-colors',
                      isSelected ? 'text-white' : 'text-primary group-hover:text-white'
                    )}
                  />{' '}
                  <span>{status}</span>
                </Button>
              </SwiperSlide>
            )
          })}
          <SwiperSlide className="!w-4 !shrink-0" aria-hidden />
        </Swiper>
      </div>

      <div className="hidden lg:flex">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'px-2 hover:bg-transparent raised-off-page w-60 bg-card hover:bg-card flex items-center justify-between font-normal h-8'
              )}
            >
              <div className="flex items-center gap-3">
                {selectedStatus === null ? (
                  <ListIcon size={14} className="text-neutral-700" />
                ) : (
                  SelectedIcon && <SelectedIcon size={14} className="text-neutral-700" />
                )}
                <span>{selectedStatus ?? 'All Orders'}</span>
              </div>
              <CaretDownIcon size={14} className="ml-1 text-neutral-700" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            side="bottom"
            className="p-0 w-60"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command className="bg-card h-full">
              <CommandList className="h-full">
                <CommandItem
                  onSelect={() => {
                    setSelectedStatus(null)
                    setOpen(false)
                  }}
                  className={cn(
                    'group h-9 px-3 flex items-center justify-between gap-2 rounded-sm transition-colors duration-150 cursor-pointer',
                    selectedStatus === null
                      ? 'bg-primary! hover:bg-primary! text-white'
                      : 'text-neutral-800 hover:bg-primary! hover:text-white'
                  )}
                >
                  <div className="flex items-center gap-2 font-normal">
                    <ListIcon
                      size={20}
                      className={cn(
                        'transition-colors',
                        selectedStatus === null
                          ? 'text-white'
                          : 'text-primary group-hover:text-white'
                      )}
                    />
                    <span
                      className={cn(
                        'transition-colors',
                        selectedStatus === null
                          ? 'text-white'
                          : 'text-neutral-800 group-hover:text-white'
                      )}
                    >
                      All Orders
                    </span>
                  </div>
                  {selectedStatus === null && <CheckIcon size={16} className="text-white" />}
                </CommandItem>

                {statuses.map((status) => {
                  const config = statusConfig[status]
                  const Icon = config.icon
                  const isSelected = selectedStatus === status

                  return (
                    <CommandItem
                      key={status}
                      onSelect={() => {
                        setSelectedStatus(status)
                        setOpen(false)
                      }}
                      className={cn(
                        'group h-9 px-3 flex items-center justify-between gap-2 transition-colors duration-150 cursor-pointer',
                        isSelected
                          ? 'bg-primary! hover:bg-primary! text-white'
                          : 'text-neutral-800 hover:bg-primary! hover:text-white'
                      )}
                    >
                      <div className="flex items-center gap-2 font-normal">
                        <Icon
                          size={20}
                          className={cn(
                            'transition-colors',
                            isSelected ? 'text-white' : 'text-primary group-hover:text-white'
                          )}
                        />
                        <span
                          className={cn(
                            'transition-colors',
                            isSelected ? 'text-white' : 'text-neutral-800 group-hover:text-white'
                          )}
                        >
                          {status}
                        </span>
                      </div>
                      {isSelected && <CheckIcon size={16} className="text-white" />}
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

type EmptyStateProps = {
  statusLabel: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
}

export function OrderStatusEmptyState({ statusLabel, Icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col flex-grow items-center gap-4 py-20">
      <div className="relative">
        <Icon size={128} className="text-primary" />
        <SearchX className="absolute -top-2 -right-2 text-neutral-500" size={32} />
      </div>
      <p className="text-lg font-medium text-muted-foreground">No {statusLabel} Orders Found</p>
    </div>
  )
}
