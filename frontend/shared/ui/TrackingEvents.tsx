import { cn } from '@/shared/utils/cn'
import { formatDateWithTimeInParens } from '@/shared/utils/formatDates'
import { Skeleton } from '@dorado/components'
import type { ShipmentView } from '@dorado/contracts'

/* IT RENDERS THE TIMELINE, it no longer derives one. Forty lines of reasoning
   about what a carrier's scans MEAN - which four stages a parcel passes
   through, that "Label Created" is our own act and not the carrier's, that a
   repeated status at a repeated place is one event, and which stages are still
   ahead - lived in this component with no test. It is
   api/domain/shipping/rules.ts `trackingTimeline` now, and it arrives on
   ShipmentView.timeline already ordered, with `reached` saying which rungs are
   solid.

   `background_color`, `borderColor` and `useStatusColor` are GONE. They were
   appearance passed as props, which ruling 20 forbids, and all six call sites
   resolved them to the same two values. */
const STAGE_COUNT = 4

export default function TrackingEvents({
  isLoading,
  shipment,
}: {
  isLoading: boolean
  shipment: ShipmentView | null | undefined
}) {
  const steps = shipment?.timeline ?? []
  const delivery_date = shipment?.shipment.delivered_at ?? shipment?.shipment.est_delivery ?? null

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 w-full animate-pulse">
        <div className="flex items-center justify-between w-full mb-4">
          <Skeleton className="h-4 w-1/3 bg-card" />
          <Skeleton className="h-4 w-1/6 bg-card" />
        </div>
        {/* A timeline, not prose - see the note in the order drawer's
            InTransit: `flex` is what typography.css's layout-intent
            exemption reads, and it is what this list actually is. */}
        <ol className="relative ml-4 flex flex-col">
          {Array.from({ length: STAGE_COUNT }, (_, i) => (
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
    )
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <div className="flex items-end justify-between w-full mb-8">
          <div className="flex flex-col items-start">
            <small>Tracking #:</small>
            <strong className="stat-sm">{shipment?.shipment.tracking_number}</strong>
          </div>
          <div className="flex flex-col items-end">
            <small>
              {delivery_date &&
                `${shipment?.tracking_status === 'Delivered' ? 'Delivered' : 'ETA'}:`}
            </small>
            <strong className="stat-sm">
              {delivery_date ? formatDateWithTimeInParens(delivery_date) : 'TBD'}
            </strong>
          </div>
        </div>

        {/* A timeline, not prose - see above. */}
        <ol className="relative ml-4 flex flex-col">
          {steps.map((step, i) => (
            <li
              key={`${step.stage}-${step.location ?? i}`}
              className={cn(
                'relative pl-6 pb-6 flex justify-between items-start',
                i < steps.length - 1 && 'border-l',
                step.reached ? 'border-primary' : 'border-card'
              )}
            >
              {/* The shadow is gone (ruling 27). A dot on a timeline needs no
                  elevation; the fill is the whole signal. */}
              <div
                className={cn(
                  'absolute -left-[10px] w-5 h-5 rounded-full',
                  step.reached ? 'bg-primary' : 'bg-card'
                )}
              />

              <div>
                <small>{step.stage}</small>
                {step.location && <strong className="block">{step.location}</strong>}
              </div>

              <small className="ml-auto">
                {step.scan_time ? formatDateWithTimeInParens(step.scan_time) : null}
              </small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
