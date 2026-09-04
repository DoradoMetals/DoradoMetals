import { cn } from '@/shared/utils/cn'
import { ShipmentTracking } from '@/features/shipping/types'
import { formatDateWithTimeInParens } from '@/shared/utils/formatDates'
import { Skeleton } from '@dorado/components'

const MASTER_STAGES = ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'] as const

/* `background_color`, `borderColor` and `useStatusColor` are GONE. They were
   appearance passed as props, which ruling 20 forbids, and all six call sites
   resolved them to the same two values - four passed nothing, and the two admin
   ones assigned `const baseBg = 'bg-primary'` a line above the call. Three
   props, one appearance, zero callers disagreeing. */
export default function TrackingEvents({
  isLoading,
  trackingInfo,
  delivery_date,
  shipping_status,
}: {
  isLoading: boolean
  trackingInfo: ShipmentTracking | null | undefined
  delivery_date?: string
  shipping_status: string
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
            <Skeleton className="h-4 w-1/3 bg-card" />
            <Skeleton className="h-4 w-1/6 bg-card" />
          </div>
          {/* A timeline, not prose - see the note in the order drawer's
              InTransit: `flex` is what typography.css's layout-intent
              exemption reads, and it is what this list actually is. */}
          <ol className="relative ml-4 flex flex-col">
            {MASTER_STAGES.map((_, i) => (
              <li key={i} className="relative pl-6 pb-6 flex items-center">
                <Skeleton className="absolute -left-[10px] h-5 w-5 rounded-full bg-card" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/4 bg-card" />
                  <Skeleton className="h-3 w-1/2 bg-card" />
                </div>
                <Skeleton className="h-3 w-16 ml-auto bg-card" />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-between w-full mb-8">
            <div className="flex flex-col items-start">
              <small>Tracking #:</small>
              <strong className="stat-sm">{trackingInfo?.tracking_number}</strong>
            </div>
            <div className="flex flex-col items-end">
              <small>
                {delivery_date && `${shipping_status === 'Delivered' ? 'Delivered' : 'ETA'}:`}
              </small>
              <strong className="stat-sm">
                {delivery_date ? `${formatDateWithTimeInParens(delivery_date)}` : 'TBD'}
              </strong>
            </div>
          </div>

          {/* A timeline, not prose - see the note in the order drawer's
              InTransit: `flex` is what typography.css's layout-intent
              exemption reads, and it is what this list actually is. */}
          <ol className="relative ml-4 flex flex-col">
            {steps.map((step, i) => (
              <li
                key={step.id}
                className={cn(
                  'relative pl-6 pb-6 flex justify-between items-start',
                  i < steps.length - 1 && 'border-l',
                  step.active ? 'border-primary' : 'border-card'
                )}
              >
                {/* The shadow is gone (ruling 27). A dot on a timeline needs no
                    elevation; the fill is the whole signal. */}
                <div
                  className={cn(
                    'absolute -left-[10px] w-5 h-5 rounded-full',
                    step.active ? 'bg-primary' : 'bg-card'
                  )}
                />

                <div>
                  <small>{step.key}</small>
                  {step.location && <strong className="block">{step.location}</strong>}
                </div>

                <small className="ml-auto">{step.date}</small>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
