'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import { Command, CommandItem, CommandList } from '@/shared/ui/base/command'
import { Button } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'
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
                  /* ⚠ D99 — THE ICON DISAPPEARED WHEN THE PILL WAS SELECTED.
                     A selected pill is `bg-primary`, which is WHITE, and the
                     icon was pinned to `text-white` in exactly that branch:
                     1.04:1, and only in the selected state, so no screenshot of
                     an unselected filter shows it. Nothing paints the icon now
                     - it inherits the pill's own colour, which is what flips.
                     `shadow-sm` went with ruling 27. */
                  className={cn(
                    'px-4 py-1 whitespace-nowrap rounded-lg transition-colors duration-150 flex items-center gap-1 border border-transparent',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card hover:bg-primary hover:text-primary-foreground'
                  )}
                >
                  <Icon size={16} className="transition-colors" />{' '}
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
            {/* `hover:bg-card` sat on a `bg-card` element - a hover cancelling
                itself, which is the shape ruling 20 calls out. Now a real
                hover, and the shadow is gone (ruling 27). */}
            <Button
              variant="secondary"
              className="px-2 w-60 flex items-center justify-between h-8"
            >
              <span className="flex items-center gap-3">
                {selectedStatus === null ? (
                  <ListIcon size={14} />
                ) : (
                  SelectedIcon && <SelectedIcon size={14} />
                )}
                <span>{selectedStatus ?? 'All Orders'}</span>
              </span>
              <CaretDownIcon size={14} className="ml-1" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            side="bottom"
            className="p-0 w-60"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command surface="card" className="h-full">
              <CommandList className="h-full">
                <CommandItem
                  onSelect={() => {
                    setSelectedStatus(null)
                    setOpen(false)
                  }}
                  className={cn(
                    'group h-9 px-3 flex items-center justify-between gap-2 rounded-sm transition-colors duration-150 cursor-pointer',
                    selectedStatus === null
                      ? 'bg-primary! hover:bg-primary! text-primary-foreground'
                      : 'text-neutral-800 hover:bg-primary! hover:text-primary-foreground'
                  )}
                >
                  {/* ⚠ D99 — THE SELECTED ROW WENT WHITE ON WHITE. The row fills
                      with `bg-primary!` when selected, and the icon, the label
                      and the tick were all pinned to `text-white` in that same
                      branch. Selecting a status made the row you had just
                      chosen unreadable. Nothing paints them now: they inherit
                      the row's `text-primary-foreground`. */}
                  <span className="flex items-center gap-2">
                    <ListIcon size={20} className="transition-colors" />
                    <span className="transition-colors">All Orders</span>
                  </span>
                  {selectedStatus === null && <CheckIcon size={16} />}
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
                          ? 'bg-primary! hover:bg-primary! text-primary-foreground'
                          : 'text-neutral-800 hover:bg-primary! hover:text-primary-foreground'
                      )}
                    >
                      {/* Same D99 collapse as the "All Orders" row above. */}
                      <span className="flex items-center gap-2">
                        <Icon size={20} className="transition-colors" />
                        <span className="transition-colors">{status}</span>
                      </span>
                      {isSelected && <CheckIcon size={16} />}
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
      <h3>No {statusLabel} Orders Found</h3>
    </div>
  )
}
