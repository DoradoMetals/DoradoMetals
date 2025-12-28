import { cn } from '@/shared/utils/cn'
import { ShipmentTracking } from '@/features/shipping/types'
import { formatDateWithTimeInParens } from '@/shared/utils/formatDates'

const MASTER_STAGES = ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'] as const

export default function TrackingEvents({
  isLoading,
  trackingInfo,
  background_color = 'bg-primary',
  borderColor = 'border-primary',
  delivery_date,
  shipping_status,
  useStatusColor = true,
}: {
  isLoading: boolean
  trackingInfo: ShipmentTracking | null | undefined
  background_color?: string
  borderColor?: string
  delivery_date?: string
  shipping_status: string
  useStatusColor?: boolean
}) {
  const scanEvents = trackingInfo?.scan_events ?? []

  const normalizedScanEvents = scanEvents
    .filter((e) => e.status !== 'Label Created' && e.scan_time && e.status && e.location)
    .sort((a, b) => new Date(b.scan_time).getTime() - new Date(a.scan_time).getTime())

  const dedupedMap = new Map<string, (typeof normalizedScanEvents)[0]>()
  for (const e of normalizedScanEvents) {
    const key = `${e.status}-${e.location}`
    if (!dedupedMap.has(key)) dedupedMap.set(key, e)
  }
  const dedupedEvents = Array.from(dedupedMap.values())

  const existingMasterStatuses = MASTER_STAGES.filter((stage) =>
    dedupedEvents.some((e) => e.status === stage)
  )

  const missingStages = MASTER_STAGES.filter(
    (stage, i) =>
      !existingMasterStatuses.includes(stage) &&
      !MASTER_STAGES.slice(i + 1).some((laterStage) => existingMasterStatuses.includes(laterStage))
  ).map((stage, i) => ({
    key: stage,
    location: null,
    date: null,
    rawDate: new Date(Infinity),
    active: false,
    id: dedupedEvents.length + i,
  }))

  const steps = [
    ...dedupedEvents.map((e, i) => ({
      key: e.status,
      location: e.location,
      rawDate: new Date(e.scan_time),
      date: formatDateWithTimeInParens(e.scan_time),
      active: true,
      id: i,
    })),
    ...missingStages.map((s) => ({
      ...s,
      rawDate: new Date(Infinity),
    })),
  ].sort((a, b) => {
    const aTime = a.rawDate?.getTime() ?? 0
    const bTime = b.rawDate?.getTime() ?? 0
    return aTime - bTime
  })

  return (
    <div className="flex flex-col gap-5 w-full">
      {isLoading ? (
        <div className="flex flex-col gap-5 w-full animate-pulse">
          <div className="flex items-center justify-between w-full mb-4">
            <div className="h-4 bg-card rounded w-1/3" />
            <div className="h-4 bg-card rounded w-1/6" />
          </div>
          <ol className="relative ml-4">
            {MASTER_STAGES.map((_, i) => (
              <li key={i} className="relative pl-6 pb-6 flex items-center">
                <div className="absolute -left-[10px] w-5 h-5 bg-card rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-card rounded w-1/4" />
                  <div className="h-3 bg-card rounded w-1/2" />
                </div>
                <div className="h-3 w-16 bg-card rounded ml-auto" />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-between w-full mb-8">
            <div className="flex flex-col items-start">
              <div className="text-sm text-neutral-600">Tracking #:</div>
              <div className="text-lg text-neutral-900">{trackingInfo?.tracking_number}</div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-sm text-neutral-600">
                {delivery_date && `${shipping_status === 'Delivered' ? 'Delivered' : 'ETA'}:`}
              </div>
              <span className="text-lg text-neutral-900">
                {delivery_date ? `${formatDateWithTimeInParens(delivery_date)}` : 'TBD'}
              </span>
            </div>
          </div>

          <ol className="relative ml-4">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className={cn(
                  'relative pl-6 pb-6 flex justify-between items-start',
                  i < steps.length - 1 && 'border-l',
                  step.active
                    ? useStatusColor
                      ? borderColor
                      : 'border-primary'
                    : 'border-card'
                )}
              >
                <div
                  className={cn(
                    'absolute -left-[10px] w-5 h-5 rounded-full raised-off-page',
                    step.active ? useStatusColor ? background_color : 'bg-primary' : 'bg-card'
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
