import { cn } from '@/lib/utils'
import { ShipmentTracking } from '@/types/shipping'
import { formatDateWithTimeInParens } from '@/utils/dateFormatting'

const MASTER_STAGES = ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'] as const

export default function TrackingEvents({
  isLoading,
  trackingInfo,
  background_color,
  borderColor,
  delivery_date,
  shipping_status,
}: {
  isLoading: boolean
  trackingInfo: ShipmentTracking | null | undefined
  background_color?: string
  borderColor?: string
  delivery_date?: string
  shipping_status: string
}) {
  const scanEvents = trackingInfo?.scan_events ?? []

  const steps = MASTER_STAGES.map((stage, i) => {
    const ev = scanEvents.find((e) => e.status === stage)
    return {
      key: stage,
      location: ev?.location,
      date: ev?.scan_time ? formatDateWithTimeInParens(ev.scan_time) : null,
      active: Boolean(ev),
      id: i,
    }
  })

  return (
    <div className="flex flex-col gap-5 w-full">
      {isLoading ? (
        <div className="flex flex-col gap-5 w-full animate-pulse">
          {/* header skeleton */}
          <div className="flex items-center justify-between w-full mb-4">
            <div className="h-4 bg-neutral-200 rounded w-1/3" />
            <div className="h-4 bg-neutral-200 rounded w-1/6" />
          </div>
          {/* steps skeleton */}
          <ol className="relative ml-4">
            {MASTER_STAGES.map((_, i) => (
              <li key={i} className="relative pl-6 pb-6 flex items-center">
                <div className="absolute -left-[10px] w-5 h-5 bg-neutral-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-neutral-200 rounded w-1/4" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                </div>
                <div className="h-3 w-16 bg-neutral-200 rounded ml-auto" />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between w-full mb-4">
            <h3 className="text-sm text-neutral-600 tracking-widest">Delivery Tracking</h3>

            <span className="text-base text-neutral-900">
              {delivery_date
                ? `${
                    shipping_status === 'Delivered' ? 'Delivered' : 'ETA'
                  } – ${formatDateWithTimeInParens(delivery_date)}`
                : 'ETA – TBD'}
            </span>
          </div>

          <ol className="relative ml-4">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className={cn(
                  'relative pl-6 pb-6 flex justify-between items-start',
                  i < steps.length - 1 && 'border-l',
                  step.active ? borderColor : 'border-neutral-200'
                )}
              >
                <div
                  className={cn(
                    'absolute -left-[10px] w-5 h-5 rounded-full',
                    step.active ? background_color : 'bg-neutral-200'
                  )}
                />

                <div>
                  <p className="text-sm text-neutral-600">{step.key}</p>
                  {step.location && <p className="text-lg text-neutral-800">{step.location}</p>}
                </div>

                <div className="ml-auto text-sm text-neutral-500">{step.date}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
