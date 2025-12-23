import { useRef } from 'react'
import { MapPinIcon, XIcon } from '@phosphor-icons/react'
import { cn } from '@/shared/utils/cn'
import { Input } from '@/shared/ui/base/input'
import { ParsedPlaceSuggestion } from '@/features/addresses/types'

export function AddressSearchInput({
  placesReady,
  value,
  suggestions,
  dropdownOpen,
  activeIndex,
  onChangeValue,
  onOpen,
  onClose,
  onActiveIndex,
  onSelect,
  onClear,
}: {
  placesReady: boolean
  value: string
  suggestions: ParsedPlaceSuggestion[]
  dropdownOpen: boolean
  activeIndex: number
  onChangeValue: (v: string) => void
  onOpen: () => void
  onClose: () => void
  onActiveIndex: (updater: (i: number) => number) => void
  onSelect: (s: ParsedPlaceSuggestion) => void | Promise<void>
  onClear: () => void
}) {
  const blurTimer = useRef<number | null>(null)

  const closeSoon = () => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
    blurTimer.current = window.setTimeout(() => onClose(), 120)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onActiveIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault()
        void onSelect(suggestions[activeIndex])
      }
      return
    }

    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="relative">
      <MapPinIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />

      <Input
        className={cn(
          'bg-highest border-1 border-border px-9',
          !placesReady && 'opacity-70'
        )}
        placeholder={placesReady ? 'Search...' : 'Loading'}
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        onFocus={() => onOpen()}
        onBlur={closeSoon}
        onKeyDown={handleKeyDown}
      />

      {!!value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 hover:bg-card"
        >
          <XIcon size={14} className="text-neutral-600" />
        </button>
      )}

      {dropdownOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden">
          {suggestions.map((s, idx) => (
            <button
              key={s.placeId}
              type="button"
              className={cn(
                'cursor-pointer w-full text-left px-3 py-2 text-sm hover:bg-highest flex flex-col gap-0.5',
                idx === activeIndex && 'bg-highest'
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void onSelect(s)}
            >
              <div className="text-neutral-800">{s.main}</div>
              {!!s.secondary && <div className="text-xs text-neutral-500">{s.secondary}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
