'use client'

import SelectMenu from '@/shared/ui/SelectMenu'
import { Button } from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode } from 'swiper/modules'

import 'swiper/css'
import 'swiper/css/free-mode'
import { CaretDownIcon, ListIcon } from '@phosphor-icons/react'

/* The "no filter" row needs a value because `SelectMenu` is keyed by string,
   and the state it drives is `string | null`. One sentinel, converted at the
   single boundary, rather than a nullable value type on the shared menu. */
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
                {/* SELECTION IS THE EMPHASIS AXIS, not a className (ruling 25).
                    This pill used to declare the retired `ghost` name and then
                    paint itself with eight appearance classes including its own
                    fill, border, radius and both hover colours - the
                    "contradicted" shape ruling 20 says should fail loudest.
                    `primary` vs `secondary` is filled vs hairline, which is a
                    far larger state step than the old `bg-card` -> `bg-primary`,
                    and the radius is now the house pill rather than `rounded-lg`
                    (ruling 19: pills for buttons and chips). */}
                <Button
                  variant={isSelected ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSelectedStatus(isSelected ? null : status)}
                  className="whitespace-nowrap"
                >
                  <Icon size={16} />
                  <span>{status}</span>
                </Button>
              </SwiperSlide>
            )
          })}
          <SwiperSlide className="!w-4 !shrink-0" aria-hidden />
        </Swiper>
      </div>

      <div className="hidden lg:flex">
        {/* SIX hand-rolled Popover+Command menus existed in the tree while
            `shared/ui/SelectMenu` had zero importers. This was one of them, and
            it carried two D99 collapses of its own (the chosen row and the
            tick both pinned `text-white` on a near-white fill). The chosen
            row's appearance is the component's now. */}
        <SelectMenu
          open={open}
          onOpenChange={setOpen}
          align="start"
          side="bottom"
          contentClassName="w-60"
          value={selectedStatus ?? ALL}
          items={[
            { label: 'All Orders', value: ALL, icon: ListIcon },
            ...statuses.map((status) => ({
              label: status,
              value: status,
              icon: statusConfig[status].icon,
            })),
          ]}
          onSelect={(value) => setSelectedStatus(value === ALL ? null : value)}
          trigger={
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
          }
        />
      </div>
    </div>
  )
}
