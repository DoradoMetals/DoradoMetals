import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { cn } from '@/shared/utils/cn'
import Image from 'next/image'

export function LotCard({
  kind,
  item,
  label,
  onClick,
  disabled,
  currentClass = 'primary-on-glass',
  futureClass = 'on-glass',
  pastClass = 'success-on-glass',
}: {
  kind?: 'current' | 'future' | 'past'
  item: any | null
  label: string
  onClick?: () => void
  disabled?: boolean
  currentClass?: string
  futureClass?: string
  pastClass?: string
}) {
  if (!item) return null

  const isClickable = !!onClick && !disabled
  const hasImage = !!item?.bullion?.image_front

  const title = item?.bullion?.product_name ?? '—'
  const lotText = item?.number != null && item?.number !== '' ? `Lot #${item.number}` : 'Lot —'

  return (
    <div className="w-full flex flex-col items-center">
      <button
        type="button"
        disabled={!isClickable}
        onClick={isClickable ? onClick : undefined}
        className={cn(
          'w-full rounded-lg overflow-hidden text-left transition-all',
          isClickable ? 'cursor-pointer' : 'cursor-default',
          kind === 'current' ? currentClass : kind === 'past' ? pastClass : futureClass
        )}
      >
        <div className="sm:text-xs md:text-sm lg:text-base xl:text-lg font-medium text-neutral-900 leading-tight truncate whitespace-nowrap overflow-hidden px-2 mt-2">
          {title}
        </div>

        <div className="mt-1 flex items-center gap-4">
          <div
            className={cn(
              'rounded-full overflow-hidden',
              kind === 'current' ? 'h-40 w-40 -ml-15 -mb-15' : 'h-35 w-35 -ml-10 -mb-15'
            )}
          >
            {hasImage ? (
              <Image
                src={item.bullion.image_front}
                alt={title}
                width={500}
                height={500}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-neutral-500">
                —
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="sm:text-base md:text-lg lg:text-xl xl:text-2xl text-neutral-800 leading-none">
              {lotText}
            </div>

            <div className="text-2xs md:text-xs lg:text-sm xl:text-base">
              <span className="text-neutral-700">Starts At: </span>
              <span className="text-neutral-900 font-semibold">
                <PriceNumberFlow value={item.starting_bid ?? 0} />
              </span>
            </div>
          </div>
        </div>
      </button>

      {label !== '' && (
        <div
          className={cn(
            'mt-1 text-xs text-neutral-700 uppercase tracking-widest',
            kind === 'current' && 'text-primary'
          )}
        >
          {label}
        </div>
      )}
    </div>
  )
}
