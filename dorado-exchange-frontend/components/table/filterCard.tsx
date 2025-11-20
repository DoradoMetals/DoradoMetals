'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type FilterCardBase = {
  key: number | string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  header: string
  label: string

  buttonBaseClassName?: string
  buttonActiveClassName?: string

  iconBaseClassName?: string
  iconActiveClassName?: string

  headerBaseClassName?: string
  headerActiveClassName?: string

  labelBaseClassName?: string
  labelActiveClassName?: string
}

export type FilterCard<TData> = FilterCardBase & {
  filter: string
  predicate: (row: TData) => boolean
}

type FilterCardsStripProps = {
  cards: FilterCardBase[]
  activeKey: string | number | null
  onChangeActive: (key: string | number | null) => void
}

export function FilterCardsStrip({ cards, activeKey, onChangeActive }: FilterCardsStripProps) {
  if (!cards || cards.length === 0) return null

  const defaultButtonActiveClass = 'bg-primary/25 text-neutral-900 border-primary'
  const defaultIconBaseClass = 'text-primary'
  const defaultIconActiveClass = 'text-primary'
  const defaultHeaderActiveClass = 'text-neutral-900'
  const defaultLabelActiveClass = 'text-neutral-900'

  return (
    <div className="flex flex-col gap-2 items-center justify-center md:flex-row w-full md:justify-between md:gap-4">
      {cards.map((card) => {
        const {
          key,
          Icon,
          header,
          label,
          buttonBaseClassName,
          buttonActiveClassName,
          iconBaseClassName,
          iconActiveClassName,
          headerBaseClassName,
          headerActiveClassName,
          labelBaseClassName,
          labelActiveClassName,
        } = card

        const isActive = activeKey === key

        const effectiveButtonActive = buttonActiveClassName ?? defaultButtonActiveClass
        const effectiveIconBase = iconBaseClassName ?? defaultIconBaseClass
        const effectiveIconActive = iconActiveClassName ?? defaultIconActiveClass
        const effectiveHeaderActive = headerActiveClassName ?? defaultHeaderActiveClass
        const effectiveLabelActive = labelActiveClassName ?? defaultLabelActiveClass

        const buttonClass = cn(
          'cursor-pointer bg-card border-1 border-border rounded-lg p-2 w-full h-auto bg-highest',
          buttonBaseClassName,
          isActive && effectiveButtonActive
        )

        const iconClass = cn(isActive ? effectiveIconActive : effectiveIconBase)

        const headerClass = cn(
          'text-base sm:text-lg text-neutral-800',
          headerBaseClassName,
          isActive && effectiveHeaderActive
        )

        const labelClass = cn(
          'text-xs sm:text-sm text-neutral-600 font-normal',
          labelBaseClassName,
          isActive && effectiveLabelActive
        )

        return (
          <button
            key={key}
            onClick={() => onChangeActive(isActive ? null : key)}
            className={buttonClass}
          >
            <div className="flex items-start sm:items-center justify-between w-full">
              <Icon size={36} className={iconClass} />

              <div className="flex flex-col items-end">
                <div className={headerClass}>{header}</div>
                <div className={labelClass}>{label}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
